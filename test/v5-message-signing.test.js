import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { signAsRFC9421ToRequestOrResponse } from '@misskey-dev/node-http-message-signatures';

describe('v5 HTTP message signatures', () => {
  const secret = crypto.randomBytes(32);
  const apiKey = 'v5-test-api-key';
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const publicKeyClaim = keyPair.publicKey.toString('base64');
  let server;

  beforeAll(async () => {
    process.env.APPROOV_SECRET = secret.toString('base64');
    process.env.API_KEY = apiKey;
    process.env.ENFORCE_APPROOV = 'true';
    process.env.ENFORCE_HTTPS = 'false';
    process.env.HTTPS_MODE = 'direct';
    process.env.HTTP_PORT = '0';
    process.env.ENABLE_LOGGING = 'false';

    ({ httpServer: server } = await import('../server/index.js'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  const approovToken = claims => jwt.sign(claims, secret, { expiresIn: '1h' });

  const signatureHeaders = async (path = '/v5/shapes', identifiers = ['@method', '@path']) => {
    const signableRequest = {
      method: 'GET',
      url: path,
      headers: { host: 'shapes.test' }
    };
    await signAsRFC9421ToRequestOrResponse(signableRequest, {
      approov: {
        key: { privateKeyPem: keyPair.privateKey, keyId: 'installation-key' },
        identifiers
      }
    });
    return {
      'Signature-Input': signableRequest.headers['Signature-Input'],
      Signature: signableRequest.headers.Signature
    };
  };

  const signedRequest = async (options = {}) => {
    const headers = await signatureHeaders(options.path, options.identifiers);
    return request(server)
      .get('/v5/shapes')
      .set('Api-Key', apiKey)
      .set('Approov-Token', approovToken({ ipk: options.ipk ?? publicKeyClaim }))
      .set(headers);
  };

  test('keeps the single health endpoint public', async () => {
    const response = await request(server).get('/hello');

    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello, World!');
  });

  test('requires the API key before other v5 checks', async () => {
    const response = await request(server).get('/v5/shapes');

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('missing the api key in the request');
  });

  test('requires an Approov token when enforcement is enabled', async () => {
    const response = await request(server)
      .get('/v5/shapes')
      .set('Api-Key', apiKey);

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('missing approov token');
  });

  test('preserves the unsigned compatibility path when the token has no ipk', async () => {
    const response = await request(server)
      .get('/v5/shapes')
      .set('Api-Key', apiKey)
      .set('Approov-Token', approovToken({}));

    expect(response.status).toBe(200);
    expect(response.body.status).toMatch(/approoved without message signature/);
  });

  test('accepts a valid P-256 signature bound to the request method and path', async () => {
    const response = await signedRequest();

    expect(response.status).toBe(200);
    expect(response.body.status).toMatch(/approoved with valid message signature/);
  });

  test('rejects a missing signature when the token contains an ipk', async () => {
    const response = await request(server)
      .get('/v5/shapes')
      .set('Api-Key', apiKey)
      .set('Approov-Token', approovToken({ ipk: publicKeyClaim }));

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('malformed message signature');
  });

  test('rejects a signature made for a different path', async () => {
    const response = await signedRequest({ path: '/v5/other' });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('invalid message signature');
  });

  test('rejects signatures that do not bind the request path', async () => {
    const response = await signedRequest({ identifiers: ['@method'] });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('malformed message signature');
  });

  test('returns a controlled error for a malformed ipk claim', async () => {
    const response = await signedRequest({ ipk: 'not-a-public-key' });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('invalid message signature public key');
  });
});
