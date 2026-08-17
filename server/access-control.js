import { verifyApiKey } from './api-key.js';
import { verifyToken } from './auth.js';
import { debug, readBooleanEnv } from './utils.js';

const requireApiKey = (ctx) => {
  const result = verifyApiKey(ctx);
  ctx.state.auth = { ...ctx.state.auth, api_key: result.valid ? 'valid' : 'invalid' };

  if (!result.valid) {
    ctx.state.auth_failure = result.status;
    debug(`api key validation failed: ${result.status}`);
    ctx.throw(400, result.status);
  }

  debug('api key is valid');
};

const requireApproovToken = (ctx) => {
  const result = verifyToken(ctx);
  ctx.state.auth = { ...ctx.state.auth, approov_token: result.valid ? 'valid' : 'invalid' };
  ctx.state.approovClaims = result.claims;

  if (!result.valid) {
    ctx.state.auth_failure = result.status;
    if (readBooleanEnv('ENFORCE_APPROOV', true)) {
      debug(`Approov token validation failed: ${result.status}`);
      ctx.throw(400, result.status);
    }
    debug(`Approov token validation failed in warning mode: ${result.status}`);
  } else {
    debug('Approov token is valid');
  }

  return result;
};

export { requireApiKey, requireApproovToken };
