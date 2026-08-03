process.env.ENABLE_LOGGING = 'false';

const request = require('supertest');
const {
  decodeObjectFromListOfListsJsonUtf8B64url: decodePayload,
  encodeListOfListsJsonUtf8B64urlFromObject: encodePayload
} = require('../server/custom-payload');

const encodeJson = value => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('custom payload parser', () => {
  test.each([
    ['a non-iterable object', { length: 1 }],
    ['a non-string value', [['id', 7]]],
    ['an incomplete pair', [['id']]],
    ['a duplicate key', [['id', 'one'], ['id', 'two']]]
  ])('rejects %s', (_description, payload) => {
    expect(decodePayload(encodeJson(payload)).valid).toBe(false);
  });

  test('handles object prototype property names safely', () => {
    const result = decodePayload(encodeJson([
      ['hasOwnProperty', 'value'],
      ['id', 'device']
    ]));

    expect(result.valid).toBe(true);
    expect(result.data.hasOwnProperty).toBe('value');
    expect(encodePayload(result.data, result.keys).valid).toBe(true);
  });

  test('rejects non-canonical base64url input', () => {
    expect(decodePayload('not+base64').valid).toBe(false);
  });
});

describe('v4 malformed payload response', () => {
  let server;

  beforeAll(() => {
    process.env.ENFORCE_APPROOV = 'true';
    process.env.ENFORCE_HTTPS = 'false';
    process.env.HTTPS_MODE = 'direct';
    process.env.HTTP_PORT = '0';
    ({ httpServer: server } = require('../server/index'));
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('returns a controlled client error instead of 500', async () => {
    const response = await request(server)
      .get('/v4/shapes')
      .set('Pay-Content', encodeJson({ length: 1 }));

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('device fail; invalid data in payload header');
  });
});
