import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const approovSecret = crypto.randomBytes(32);
const apiKey = 'test-api-key';

process.env.APPROOV_SECRET = approovSecret.toString('base64');
process.env.API_KEY = apiKey;
process.env.HTTP_PORT = '0';
process.env.ENFORCE_HTTPS = 'false';
process.env.ENFORCE_APPROOV = 'true';
process.env.ENABLE_LOGGING = 'false';

const { httpServer: server } = await import('../server/index.js');

afterAll(() => new Promise(resolve => server.close(resolve)));

const shapes = [ 'Circle', 'Rectangle', 'Square', 'Triangle' ];
const approovToken = () => jwt.sign({
  iss: 'quickstart-test.approov.io',
  aud: 'shapes.approov.io',
  sub: 'approov|test-device|com.approov.quickstart'
}, approovSecret, { expiresIn: '1h' });

test('GET /hello is the single public connection check', async () => {
  const response = await request(server).get('/hello');

  expect(response.status).toBe(200);
  expect(response.type).toMatch(/^text\/plain/);
  expect(response.text).toBe('Hello, World!');
  expect(response.headers['x-request-id']).toBeTruthy();
});

test('GET /v1/shapes returns a shape for a valid API key', async () => {
  const response = await request(server)
    .get('/v1/shapes')
    .set('Api-Key', apiKey);

  expect(response.status).toBe(200);
  expect(shapes).toContain(response.body.shape);
});

test('GET /v3/shapes returns a shape for a valid API key and Approov token', async () => {
  const response = await request(server)
    .get('/v3/shapes')
    .set('Api-Key', apiKey)
    .set('Approov-Token', approovToken());

  expect(response.status).toBe(200);
  expect(shapes).toContain(response.body.shape);
});

test('GET /v5/shapes keeps the unsigned compatibility path when ipk is absent', async () => {
  const response = await request(server)
    .get('/v5/shapes')
    .set('Api-Key', apiKey)
    .set('Approov-Token', approovToken());

  expect(response.status).toBe(200);
  expect(shapes).toContain(response.body.shape);
  expect(response.body.status).toMatch(/without message signature/);
});

test.each([
  '/',
  '/robots.txt',
  '/shapes',
  '/v1/hello',
  '/v1/forms',
  '/v2/hello',
  '/v2/shapes',
  '/v2/forms',
  '/v3/hello',
  '/v3/forms',
  '/v4/hello',
  '/v4/shapes',
  '/v4/register',
  '/v5/hello'
])('GET %s is not exposed', async path => {
  const response = await request(server).get(path);

  expect(response.status).toBe(404);
});
