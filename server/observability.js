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

const buildUsageEvent = (ctx, durationMs) => {
  const route = SUPPORTED_ENDPOINTS.get(`${ctx.method} ${ctx.path}`);
  const claims = ctx.state.approovClaims || {};
  const country = clientCountry(ctx);
  const clientIp = ctx.ip;

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
    client_ip: readBooleanEnv('LOG_CLIENT_IP', false) ? clientIp : undefined,
    country,
    token_ip_matches_request: typeof claims.ip === 'string' && clientIp ? claims.ip === clientIp : undefined,
    user_agent: readBooleanEnv('LOG_USER_AGENT', false) ? safeText(ctx.get('User-Agent'), 200) : undefined,
    auth: Object.keys(ctx.state.auth || {}).length ? ctx.state.auth : undefined,
    auth_failure: safeText(ctx.state.auth_failure, 100)
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
      throw new Error(`Google Analytics returned HTTP ${response.status}`);
    }
    return { sent: true };
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
    logEvent('info', usageEvent);

    if (usageEvent.supported_endpoint) {
      void sendGoogleAnalyticsEvent(usageEvent).catch((error) => {
        logEvent('warn', {
          event: 'analytics_delivery_failed',
          request_id: usageEvent.request_id,
          provider: 'google_analytics',
          reason: safeText(error.message, 160)
        });
      });
    }
  }
};

export {
  buildUsageEvent,
  logEvent,
  sendGoogleAnalyticsEvent,
  trackingHash,
  usageTracking
};
