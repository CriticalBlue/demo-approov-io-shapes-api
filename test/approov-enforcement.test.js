import request from 'supertest';
import { readBooleanEnv } from '../server/utils.js';

describe('Approov enforcement configuration', () => {
  let server;

  beforeAll(async () => {
    process.env.ENFORCE_APPROOV = 'TRUE';
    process.env.ENFORCE_HTTPS = 'false';
    process.env.HTTPS_MODE = 'direct';
    process.env.HTTP_PORT = '0';
    process.env.ENABLE_LOGGING = 'false';

    ({ httpServer: server } = await import('../server/index.js'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('treats boolean values case-insensitively and fails closed', async () => {
    const response = await request(server).get('/v2/shapes');

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('missing approov token');
  });
});

describe('boolean environment parsing', () => {
  test('rejects an invalid value', () => {
    process.env.TEST_BOOLEAN = 'not-a-boolean';

    expect(() => readBooleanEnv('TEST_BOOLEAN', true)).toThrow(
      "TEST_BOOLEAN must be either 'true' or 'false'"
    );

    delete process.env.TEST_BOOLEAN;
  });
});
