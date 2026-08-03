const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

describe('v4 payload checks', () => {
  const secret = crypto.randomBytes(32);
  const apiKey = 'v4-test-api-key';
  let server;

  beforeAll(() => {
    process.env.APPROOV_SECRET = secret.toString('base64');
    process.env.API_KEY = apiKey;
    process.env.ENFORCE_APPROOV = 'true';
    process.env.ENFORCE_HTTPS = 'false';
    process.env.HTTPS_MODE = 'direct';
    process.env.HTTP_PORT = '0';
    process.env.ENABLE_LOGGING = 'false';

    ({ httpServer: server } = require('../server/index'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  const signedPayload = (deviceId, entries) => {
    const json = JSON.stringify(entries);
    return {
      header: Buffer.from(json).toString('base64url'),
      token: jwt.sign({
        did: deviceId,
        pay: crypto.createHash('sha256').update(json).digest('base64')
      }, secret, { expiresIn: '1h' })
    };
  };

  const register = (deviceId, entries) => {
    const payload = signedPayload(deviceId, entries);
    return request(server)
      .post('/v4/register')
      .set('Api-Key', apiKey)
      .set('Approov-Token', payload.token)
      .set('Pay-Content', payload.header);
  };

  test('accepts a bound payload with a non-empty device id', async () => {
    const response = await register('device-valid', [['id', 'device-valid']]);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.headers['pay-response']).toBeTruthy();
  });

  test.each([
    ['a missing id', [['model', 'phone']]],
    ['an empty id', [['id', '']]]
  ])('rejects %s instead of silently passing it', async (_description, entries) => {
    const response = await register(`device-${_description}`, entries);

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('device fail; updated token');
  });

  test('rejects registration tokens without a device id claim', async () => {
    const json = JSON.stringify([['id', 'device-without-claim']]);
    const token = jwt.sign({
      pay: crypto.createHash('sha256').update(json).digest('base64')
    }, secret, { expiresIn: '1h' });

    const response = await request(server)
      .post('/v4/register')
      .set('Api-Key', apiKey)
      .set('Approov-Token', token)
      .set('Pay-Content', Buffer.from(json).toString('base64url'));

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('device fail; missing device id');
  });
});
