import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { readBooleanEnv } from './utils.js';

const SERVICE_NAME = 'shapes-api';
const SUPPORTED_ENDPOINTS = new Map([
  ['GET /hello', { endpoint: 'hello', api_version: 'health' }],
  ['GET /v1/shapes', { endpoint: 'shapes', api_version: 'v1' }],
  ['GET /v3/shapes', { endpoint: 'shapes', api_version: 'v3' }],
  ['GET /v5/shapes', { endpoint: 'shapes', api_version: 'v5' }]
]);
const GA_HOSTS = new Set(['www.google-analytics.com', 'region1.google-analytics.com']);

const compact = (value) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
);

const safeText = (value, maximumLength = 100) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return normalized ? normalized.slice(0, maximumLength) : undefined;
};

const redactGoogleAnalyticsSecret = (value) => {
  if (typeof value !== 'string' || !process.env.GA_API_SECRET) {
    return value;
  }

  return value
    .replaceAll(process.env.GA_API_SECRET, '[redacted]')
    .replaceAll(encodeURIComponent(process.env.GA_API_SECRET), '[redacted]');
};

const logValue = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (_key, entry) => {
      if (typeof entry === 'bigint') {
        return entry.toString();
      }
      if (typeof entry === 'object' && entry !== null) {
        if (seen.has(entry)) {
          return '[circular]';
        }
        seen.add(entry);
      }
      return entry;
    }));
  } catch (error) {
    return `[unserializable: ${safeText(error.message, 160) || 'unknown error'}]`;
  }
};

const quickstartName = (value) => {
  const name = safeText(value, 80);
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(name || '') ? name : undefined;
};

const trackingHash = (value) => {
  const salt = process.env.TRACKING_HASH_SALT;
  if (typeof value !== 'string' || !value || typeof salt !== 'string' || salt.length < 16) {
    return undefined;
  }

  return crypto.createHmac('sha256', salt).update(value).digest('hex').slice(0, 32);
};

const appFromSubject = (subject) => {
  const parts = typeof subject === 'string' ? subject.split('|') : [];
  return parts.length >= 3 && parts[0] === 'approov' ? safeText(parts.at(-1), 100) : undefined;
};

const clientCountry = (ctx) => {
  if (!readBooleanEnv('TRUST_PROXY', false)) {
    return undefined;
  }

  const headerName = process.env.CLIENT_COUNTRY_HEADER;
  if (!headerName || !/^[a-z0-9-]+$/i.test(headerName)) {
    return undefined;
  }

  const country = ctx.get(headerName).toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : undefined;
};

const requestId = (ctx) => {
  const supplied = ctx.get('X-Request-ID');
  return /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
};

const requestHeaders = (ctx) => {
  if (!readBooleanEnv('LOG_REQUEST_HEADERS', true)) {
    return undefined;
  }

  const headers = { ...ctx.headers };
  for (const name of ['api-key', 'x-api-key', 'authorization', 'cookie', 'proxy-authorization']) {
    if (headers[name]) {
      headers[name] = '[redacted]';
    }
  }
  if (headers['approov-token']) {
    headers['approov-token'] = readBooleanEnv('LOG_APPROOV_TOKEN', true) ?
      '[captured in approov.token]' : '[redacted]';
  }
  return headers;
};

const responseHeaders = (ctx) => {
  const headers = { ...ctx.response?.headers };
  if (headers['set-cookie']) {
    headers['set-cookie'] = '[redacted]';
  }
  return headers;
};

const rejectionDetails = (ctx) => {
  if (ctx.status < 400) {
    return undefined;
  }

  return compact({
    stage: safeText(ctx.state.rejectionStage, 80) ||
      (ctx.status === 404 ? 'routing' : ctx.status === 405 ? 'method' : 'request'),
    reason: safeText(ctx.state.auth_failure || ctx.state.error?.message || ctx.body?.status, 300) ||
      (ctx.status === 404 ? 'route not found' : ctx.status === 405 ? 'method not allowed' : safeText(ctx.message, 300)),
    error: logValue(ctx.state.error)
  });
};

const buildUsageEvent = (ctx, durationMs) => {
  const route = SUPPORTED_ENDPOINTS.get(`${ctx.method} ${ctx.path}`);
  const claims = ctx.state.approovClaims || {};
  const country = clientCountry(ctx);
  const clientIp = ctx.ip;

  const logClientIp = readBooleanEnv('LOG_CLIENT_IP', true);
  const logUserAgent = readBooleanEnv('LOG_USER_AGENT', true);
  const logApproovToken = readBooleanEnv('LOG_APPROOV_TOKEN', true);
  const approovToken = ctx.get('Approov-Token');
  const approovDetails = logApproovToken && (approovToken || Object.keys(claims).length) ? compact({
    token: approovToken,
    claims: logValue(claims)
  }) : undefined;

  return compact({
    event: 'api_request',
    request_id: ctx.state.requestId,
    method: ctx.method,
    endpoint: route?.endpoint || 'unmatched',
    api_version: route?.api_version || 'none',
    supported_endpoint: Boolean(route),
    status_code: ctx.status,
    outcome: ctx.status >= 500 ? 'error' : ctx.status >= 400 ? 'rejected' : 'success',
    duration_ms: Math.round(durationMs * 100) / 100,
    quickstart: quickstartName(ctx.get('X-Approov-Quickstart')),
    approov_account: safeText(claims.iss, 100),
    app_id: appFromSubject(claims.sub),
    audience: safeText(claims.aud, 100),
    device_id_hash: trackingHash(claims.did),
    client_ip_hash: trackingHash(clientIp),
    client_ip: logClientIp ? clientIp : undefined,
    country,
    token_ip_matches_request: typeof claims.ip === 'string' && clientIp ? claims.ip === clientIp : undefined,
    user_agent: logUserAgent ? safeText(ctx.get('User-Agent'), 1000) : undefined,
    auth: Object.keys(ctx.state.auth || {}).length ? ctx.state.auth : undefined,
    auth_checks: ctx.state.authChecks?.length ? logValue(ctx.state.authChecks) : undefined,
    auth_failure: safeText(ctx.state.auth_failure, 300),
    rejection: rejectionDetails(ctx),
    request: compact({
      method: ctx.method,
      original_url: safeText(ctx.originalUrl || ctx.url, 4096),
      path: ctx.path,
      query: logValue(ctx.query),
      protocol: safeText(ctx.protocol, 20),
      host: safeText(ctx.host, 300),
      client_ip: logClientIp ? clientIp : undefined,
      proxy_ips: logClientIp && ctx.ips?.length ? ctx.ips : undefined,
      socket_ip: logClientIp ? ctx.req?.socket?.remoteAddress : undefined,
      headers: requestHeaders(ctx),
      body: readBooleanEnv('LOG_REQUEST_BODY', true) ?
        logValue(ctx.request?.body ?? ctx.request?.rawBody) : undefined
    }),
    approov: approovDetails,
    response: compact({
      status_code: ctx.status,
      message: safeText(ctx.message, 300),
      headers: responseHeaders(ctx),
      body: readBooleanEnv('LOG_RESPONSE_BODY', true) ? logValue(ctx.body) : undefined
    })
  });
};

const logEvent = (level, fields) => {
  if (!readBooleanEnv('ENABLE_LOGGING', true)) {
    return;
  }

  const entry = compact({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    environment: safeText(process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'development', 40),
    ...fields
  });
  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
};

const gaClientId = (usageEvent) => {
  const identity = usageEvent.device_id_hash || usageEvent.client_ip_hash;
  if (!identity) {
    return undefined;
  }

  const first = (Number.parseInt(identity.slice(0, 8), 16) || 1) >>> 0;
  const second = (Number.parseInt(identity.slice(8, 16), 16) || 1) >>> 0;
  return `${first}.${second}`;
};

const googleAnalyticsConfiguration = () => {
  const enabled = readBooleanEnv('ENABLE_GOOGLE_ANALYTICS', false);
  const measurementId = process.env.GA_MEASUREMENT_ID;
  const host = process.env.GA_HOST || 'region1.google-analytics.com';
  const issues = [];

  if (enabled && !/^G-[A-Z0-9]+$/.test(measurementId || '')) {
    issues.push('invalid or missing GA_MEASUREMENT_ID');
  }
  if (enabled && !process.env.GA_API_SECRET) {
    issues.push('missing GA_API_SECRET');
  }
  if (enabled && !GA_HOSTS.has(host)) {
    issues.push('GA_HOST is not allow-listed');
  }
  if (enabled && (process.env.TRACKING_HASH_SALT || '').length < 16) {
    issues.push('missing or too-short TRACKING_HASH_SALT');
  }

  return {
    enabled,
    valid: issues.length === 0,
    measurement_id: measurementId,
    host,
    api_secret_configured: Boolean(process.env.GA_API_SECRET),
    tracking_hash_salt_configured: (process.env.TRACKING_HASH_SALT || '').length >= 16,
    issues
  };
};

const sendGoogleAnalyticsEvent = async (usageEvent, fetchImplementation = globalThis.fetch) => {
  if (!readBooleanEnv('ENABLE_GOOGLE_ANALYTICS', false)) {
    return { sent: false, reason: 'disabled' };
  }

  const measurementId = process.env.GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  const host = process.env.GA_HOST || 'region1.google-analytics.com';
  const clientId = gaClientId(usageEvent);

  if (!/^G-[A-Z0-9]+$/.test(measurementId || '') || !apiSecret || !GA_HOSTS.has(host)) {
    return { sent: false, reason: 'invalid_configuration' };
  }
  if (!clientId) {
    return { sent: false, reason: 'missing_pseudonymous_identity' };
  }

  const params = compact({
    endpoint: usageEvent.endpoint,
    api_version: usageEvent.api_version,
    status_code: usageEvent.status_code,
    outcome: usageEvent.outcome,
    quickstart: usageEvent.quickstart,
    approov_account: usageEvent.approov_account,
    app_id: usageEvent.app_id,
    country: usageEvent.country,
    engagement_time_msec: Math.max(1, Math.round(usageEvent.duration_ms || 1))
  });
  const body = compact({
    client_id: clientId,
    consent: {
      ad_user_data: 'DENIED',
      ad_personalization: 'DENIED'
    },
    user_location: usageEvent.country ? { country_id: usageEvent.country } : undefined,
    events: [{ name: 'quickstart_api_request', params }]
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetchImplementation(
      `https://${host}/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );
    if (!response.ok) {
      const responseBody = safeText(redactGoogleAnalyticsSecret(await response.text().catch(() => '')), 2000);
      const error = new Error(`Google Analytics returned HTTP ${response.status}`);
      error.analytics = compact({ status_code: response.status, response_body: responseBody });
      throw error;
    }
    return { sent: true, status_code: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const usageTracking = () => async (ctx, next) => {
  const startedAt = performance.now();
  ctx.state.requestId = requestId(ctx);
  ctx.set('X-Request-ID', ctx.state.requestId);

  try {
    await next();
  } finally {
    const usageEvent = buildUsageEvent(ctx, performance.now() - startedAt);
    const requestLogLevel = ctx.status >= 500 ? 'error' : ctx.status >= 400 ? 'warn' : 'info';
    logEvent(requestLogLevel, usageEvent);

    if (usageEvent.supported_endpoint) {
      void sendGoogleAnalyticsEvent(usageEvent).then((result) => {
        if (result.sent) {
          logEvent('info', {
            event: 'analytics_delivery',
            request_id: usageEvent.request_id,
            provider: 'google_analytics',
            outcome: 'sent',
            status_code: result.status_code
          });
        } else if (result.reason !== 'disabled') {
          logEvent('warn', {
            event: 'analytics_delivery_skipped',
            request_id: usageEvent.request_id,
            provider: 'google_analytics',
            outcome: 'skipped',
            reason: result.reason
          });
        }
      }).catch((error) => {
        logEvent('error', {
          event: 'analytics_delivery_failed',
          request_id: usageEvent.request_id,
          provider: 'google_analytics',
          outcome: 'failed',
          error_name: safeText(error.name, 100),
          error_message: safeText(redactGoogleAnalyticsSecret(error.message), 500),
          error_stack: safeText(redactGoogleAnalyticsSecret(error.stack), 8000),
          provider_response: logValue(error.analytics)
        });
      });
    }
  }
};

export {
  buildUsageEvent,
  googleAnalyticsConfiguration,
  logEvent,
  sendGoogleAnalyticsEvent,
  trackingHash,
  usageTracking
};
