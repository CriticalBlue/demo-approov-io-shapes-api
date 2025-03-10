import { debug } from './utils.js';

const verifyApiKey = (ctx) => {
  debug('>>> Check API Key <<<');

  const API_KEY = process.env.API_KEY ?? '';
  const apiKey = ctx.headers['api-key'];

  if (!apiKey) {
    return { valid: false, status: 'missing the api key in the request' };
  }

  if (apiKey === API_KEY) {
    return { valid: true, status: 'valid api key' };
  }

  return { valid: false, status: 'invalid api key' };
}

export { verifyApiKey };
