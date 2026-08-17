import request from 'supertest';

describe('v5 Approov warning mode', () => {
  let server;

  beforeAll(async () => {
    process.env.API_KEY = 'v5-warning-api-key';
    process.env.ENFORCE_APPROOV = 'false';
    process.env.ENFORCE_HTTPS = 'false';
    process.env.HTTPS_MODE = 'direct';
    process.env.HTTP_PORT = '0';
    process.env.ENABLE_LOGGING = 'false';

    ({ httpServer: server } = await import('../server/index.js'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('does not crash while allowing a missing token in explicit warning mode', async () => {
    const response = await request(server)
      .get('/v5/shapes')
      .set('Api-Key', 'v5-warning-api-key');

    expect(response.status).toBe(200);
    expect(response.body.status).toMatch(/approoved without message signature/);
  });
});
