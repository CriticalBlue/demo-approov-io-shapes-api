import request from 'supertest';

describe('HTTPS enforcement', () => {
  let server;

  beforeAll(async () => {
    process.env.ENFORCE_HTTPS = 'true';
    process.env.HTTPS_MODE = 'x-forwarded-proto';
    process.env.HTTP_PORT = '0';
    process.env.ENABLE_LOGGING = 'false';

    ({ httpServer: server } = await import('../server/index.js'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('redirects an insecure request before routing it', async () => {
    const response = await request(server).get('/hello');

    expect(response.status).toBe(301);
    expect(response.headers.location).toMatch(/^https:\/\//);
  });

  test('allows a request marked secure by the trusted proxy', async () => {
    const response = await request(server)
      .get('/hello')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello, World!');
  });
});
