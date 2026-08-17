import { jest } from '@jest/globals';
import {
  buildUsageEvent,
  sendGoogleAnalyticsEvent,
  trackingHash,
  usageTracking
} from '../server/observability.js';

const trackedEnvironmentVariables = [
  'CLIENT_COUNTRY_HEADER',
  'ENABLE_LOGGING',
  'ENABLE_GOOGLE_ANALYTICS',
  'GA_API_SECRET',
  'GA_HOST',
  'GA_MEASUREMENT_ID',
  'LOG_APPROOV_TOKEN',
  'LOG_CLIENT_IP',
  'LOG_REQUEST_BODY',
  'LOG_REQUEST_HEADERS',
  'LOG_RESPONSE_BODY',
  'LOG_USER_AGENT',
  'TRACKING_HASH_SALT',
  'TRUST_PROXY'
];

afterEach(() => {
  for (const name of trackedEnvironmentVariables) {
    delete process.env[name];
  }
});

const context = () => {
  const headers = {
    'api-key': 'must-not-be-logged',
    'approov-token': 'full.approov.token.value',
    'cf-ipcountry': 'GB',
    'user-agent': 'Quickstart/Test',
    'x-approov-quickstart': 'ios-urlsession'
  };

  return {
    method: 'GET',
    originalUrl: '/v5/shapes?source=test',
    url: '/v5/shapes?source=test',
    path: '/v5/shapes',
    query: { source: 'test' },
    protocol: 'https',
    host: 'shapes.approov.io',
    status: 200,
    message: 'OK',
    body: { shape: 'circle', status: 'accepted' },
    ip: '203.0.113.42',
    ips: ['203.0.113.42', '10.0.0.2'],
    headers,
    get: name => headers[name.toLowerCase()] || '',
    set: jest.fn(),
    req: { socket: { remoteAddress: '10.0.0.2' } },
    request: {},
    response: { headers: { 'content-type': 'application/json' } },
    state: {
      requestId: 'test-request',
      auth: {
        api_key: 'valid',
        approov_token: 'valid',
        message_signature: 'not_required'
      },
      authChecks: [
        { control: 'approov_token', result: 'valid', reason: 'valid approov token', enforced: true }
      ],
      approovClaims: {
        iss: 'customer.approov.io',
        aud: 'shapes.approov.io',
        did: 'raw-device-id',
        ip: '203.0.113.42',
        sub: 'approov|raw-device-id|com.example.quickstart'
      }
    }
  };
};

test('can omit raw request identity and credential data', () => {
  process.env.TRACKING_HASH_SALT = 'a-secret-pepper-that-is-long-enough';
  process.env.TRUST_PROXY = 'true';
  process.env.CLIENT_COUNTRY_HEADER = 'CF-IPCountry';
  process.env.LOG_APPROOV_TOKEN = 'false';
  process.env.LOG_CLIENT_IP = 'false';
  process.env.LOG_REQUEST_HEADERS = 'false';
  process.env.LOG_USER_AGENT = 'false';

  const event = buildUsageEvent(context(), 12.345);
  const serialized = JSON.stringify(event);

  expect(event).toMatchObject({
    event: 'api_request',
    endpoint: 'shapes',
    api_version: 'v5',
    supported_endpoint: true,
    approov_account: 'customer.approov.io',
    app_id: 'com.example.quickstart',
    country: 'GB',
    quickstart: 'ios-urlsession',
    token_ip_matches_request: true
  });
  expect(event.device_id_hash).toHaveLength(32);
  expect(event.client_ip_hash).toHaveLength(32);
  expect(serialized).not.toContain('raw-device-id');
  expect(serialized).not.toContain('full.approov.token.value');
  expect(serialized).not.toContain('203.0.113.42');
});

test('builds a detailed request, rejection, Approov, and response record by default', () => {
  const ctx = context();
  ctx.status = 400;
  ctx.message = 'Bad Request';
  ctx.body = { status: 'invalid approov token' };
  ctx.state.auth.approov_token = 'invalid';
  ctx.state.auth_failure = 'invalid approov token';
  ctx.state.rejectionStage = 'approov_token';

  const event = buildUsageEvent(ctx, 4.5);

  expect(event).toMatchObject({
    client_ip: '203.0.113.42',
    user_agent: 'Quickstart/Test',
    outcome: 'rejected',
    rejection: {
      stage: 'approov_token',
      reason: 'invalid approov token'
    },
    request: {
      original_url: '/v5/shapes?source=test',
      query: { source: 'test' },
      client_ip: '203.0.113.42',
      proxy_ips: ['203.0.113.42', '10.0.0.2'],
      socket_ip: '10.0.0.2',
      headers: {
        'api-key': '[redacted]',
        'approov-token': '[captured in approov.token]'
      }
    },
    approov: {
      token: 'full.approov.token.value',
      claims: { did: 'raw-device-id' }
    },
    response: {
      status_code: 400,
      body: { status: 'invalid approov token' }
    }
  });
});

test('omits stable identifiers when the tracking salt is not configured', () => {
  const event = buildUsageEvent(context(), 1);

  expect(event.device_id_hash).toBeUndefined();
  expect(event.client_ip_hash).toBeUndefined();
  expect(trackingHash('anything')).toBeUndefined();
});

test('sends a non-advertising GA4 event when explicitly configured', async () => {
  process.env.ENABLE_GOOGLE_ANALYTICS = 'true';
  process.env.GA_MEASUREMENT_ID = 'G-ABC123';
  process.env.GA_API_SECRET = 'analytics-secret';
  const fetchImplementation = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  const usageEvent = {
    endpoint: 'shapes',
    api_version: 'v3',
    status_code: 200,
    outcome: 'success',
    duration_ms: 7,
    device_id_hash: '1234567890abcdef1234567890abcdef',
    approov_account: 'customer.approov.io'
  };

  await expect(sendGoogleAnalyticsEvent(usageEvent, fetchImplementation)).resolves.toEqual({
    sent: true,
    status_code: 204
  });
  expect(fetchImplementation).toHaveBeenCalledTimes(1);

  const [url, options] = fetchImplementation.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(url).toContain('region1.google-analytics.com/mp/collect');
  expect(body.consent).toEqual({ ad_user_data: 'DENIED', ad_personalization: 'DENIED' });
  expect(body.events[0]).toMatchObject({
    name: 'quickstart_api_request',
    params: { api_version: 'v3', approov_account: 'customer.approov.io' }
  });
});

test('preserves Google Analytics HTTP error details for structured failure logs', async () => {
  process.env.ENABLE_GOOGLE_ANALYTICS = 'true';
  process.env.GA_MEASUREMENT_ID = 'G-ABC123';
  process.env.GA_API_SECRET = 'analytics-secret';
  const fetchImplementation = jest.fn().mockResolvedValue({
    ok: false,
    status: 503,
    text: jest.fn().mockResolvedValue('temporarily unavailable')
  });
  const usageEvent = {
    endpoint: 'shapes',
    api_version: 'v3',
    duration_ms: 7,
    client_ip_hash: '1234567890abcdef1234567890abcdef'
  };

  await expect(sendGoogleAnalyticsEvent(usageEvent, fetchImplementation)).rejects.toMatchObject({
    message: 'Google Analytics returned HTTP 503',
    analytics: {
      status_code: 503,
      response_body: 'temporarily unavailable'
    }
  });
});

test('writes a correlated structured log when Google Analytics delivery fails', async () => {
  process.env.ENABLE_GOOGLE_ANALYTICS = 'true';
  process.env.GA_MEASUREMENT_ID = 'G-ABC123';
  process.env.GA_API_SECRET = 'analytics-secret';
  process.env.TRACKING_HASH_SALT = 'a-secret-pepper-that-is-long-enough';
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('network unavailable for api_secret=analytics-secret')
  );
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const ctx = context();

  try {
    await usageTracking()(ctx, async () => {});
    await new Promise(resolve => setImmediate(resolve));

    const requestEntry = consoleLogSpy.mock.calls
      .map(([line]) => JSON.parse(line))
      .find(entry => entry.event === 'api_request');
    const failureEntry = consoleErrorSpy.mock.calls
      .map(([line]) => JSON.parse(line))
      .find(entry => entry.event === 'analytics_delivery_failed');

    expect(failureEntry).toMatchObject({
      request_id: requestEntry.request_id,
      provider: 'google_analytics',
      outcome: 'failed',
      error_name: 'Error',
      error_message: 'network unavailable for api_secret=[redacted]'
    });
    expect(JSON.stringify(failureEntry)).not.toContain('analytics-secret');
  } finally {
    fetchSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  }
});

test('does not call GA when analytics is disabled', async () => {
  const fetchImplementation = jest.fn();

  await expect(sendGoogleAnalyticsEvent({}, fetchImplementation)).resolves.toEqual({
    sent: false,
    reason: 'disabled'
  });
  expect(fetchImplementation).not.toHaveBeenCalled();
});
