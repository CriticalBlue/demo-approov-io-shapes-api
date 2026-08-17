import { verifyApiKey } from './api-key.js';
import { verifyToken } from './auth.js';
import { debug, readBooleanEnv } from './utils.js';

const recordAuthCheck = (ctx, control, result, enforced = true) => {
  ctx.state.auth = { ...ctx.state.auth, [control]: result.valid ? 'valid' : 'invalid' };
  ctx.state.authChecks = [
    ...(ctx.state.authChecks || []),
    {
      control,
      result: result.valid ? 'valid' : 'invalid',
      reason: result.status,
      enforced,
      error_name: result.error_name,
      error_message: result.error_message
    }
  ];
};

const requireApiKey = (ctx) => {
  const result = verifyApiKey(ctx);
  recordAuthCheck(ctx, 'api_key', result);

  if (!result.valid) {
    ctx.state.auth_failure = result.status;
    ctx.state.rejectionStage = 'api_key';
    debug(`api key validation failed: ${result.status}`);
    ctx.throw(400, result.status);
  }

  debug('api key is valid');
};

const requireApproovToken = (ctx) => {
  const result = verifyToken(ctx);
  const enforceApproov = readBooleanEnv('ENFORCE_APPROOV', true);
  recordAuthCheck(ctx, 'approov_token', result, enforceApproov);
  ctx.state.approovClaims = result.claims;

  if (!result.valid) {
    ctx.state.auth_failure = result.status;
    if (enforceApproov) {
      ctx.state.rejectionStage = 'approov_token';
      debug(`Approov token validation failed: ${result.status}`);
      ctx.throw(400, result.status);
    }
    debug(`Approov token validation failed in warning mode: ${result.status}`);
  } else {
    debug('Approov token is valid');
  }

  return result;
};

export { recordAuthCheck, requireApiKey, requireApproovToken };
