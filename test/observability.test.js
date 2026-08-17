import { jest } from '@jest/globals';
import {
  buildUsageEvent,
  sendGoogleAnalyticsEvent,
  trackingHash
} from '../server/observability.js';

const trackedEnvironmentVariables = [
  'CLIENT_COUNTRY_HEADER',
  'ENABLE_GOOGLE_ANALYTICS',
  'GA_API_SECRET',
  'GA_HOST',
  'GA_MEASUREMENT_ID',
  'LOG_CLIENT_IP',
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
    'approov-token': 'must-not-be-logged',
    'cf-ipcountry': 'GB',
    'user-agent': 'Quickstart/Test',
    'x-approov-quickstart': 'ios-urlsession'
  };

  return {
    method: 'GET',
    path: '/v5/shapes',
    status: 200,
    ip: '203.0.113.42',
    get: name => headers[name.toLowerCase()] || '',
    state: {
      requestId: 'test-request',
      auth: {
        api_key: 'valid',
        approov_token: 'valid',
        message_signature: 'not_required'
      },
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

test('builds a privacy-conscious structured usage event', () => {
  process.env.TRACKING_HASH_SALT = 'a-secret-pepper-that-is-long-enough';
  process.env.TRUST_PROXY = 'true';
  process.env.CLIENT_COUNTRY_HEADER = 'CF-IPCountry';

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
  expect(serialized).not.toContain('must-not-be-logged');
  expect(serialized).not.toContain('203.0.113.42');
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

  await expect(sendGoogleAnalyticsEvent(usageEvent, fetchImplementation)).resolves.toEqual({ sent: true });
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

test('does not call GA when analytics is disabled', async () => {
  const fetchImplementation = jest.fn();

  await expect(sendGoogleAnalyticsEvent({}, fetchImplementation)).resolves.toEqual({
    sent: false,
    reason: 'disabled'
  });
  expect(fetchImplementation).not.toHaveBeenCalled();
});
