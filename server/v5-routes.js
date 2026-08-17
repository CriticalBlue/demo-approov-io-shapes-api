// shapes api server - v5 protected routes

import { debug } from './utils.js';
import Router from '@koa/router';
import { requireApiKey, requireApproovToken } from './access-control.js';
import { verifyHTTPSig } from './http-sig.js';
import { randomShape } from './shapes.js';

// API key, approov token, and HTTP message signature checks

const abortOnInvalidHTTPSig = (ctx, { valid, status }) => {
  ctx.state.auth = { ...ctx.state.auth, message_signature: valid ? 'valid' : 'invalid' };
  if (!valid) {
    ctx.state.auth_failure = status;
    debug(`HTTP signature validation failed: ${status} - error`);
    ctx.throw(400, status);
  }

  debug(`HTTP signature is valid`);
}

// routes

const router = new Router({
  prefix: '/v5'
});

// authorization

router.use('/shapes', async (ctx, next) => {
  requireApiKey(ctx);

  // Check the Approov token and extract the token claims
  const tokenResult = requireApproovToken(ctx);

  // Check whether the Approov token contains an installation public key (ipk) claim. If it does, we use this to verify
  // the HTTP signature. If it does not, we know that the message has no signature that we should check in the demo
  // server and accept the message.
  const pubKey = tokenResult.claims?.ipk;
  ctx.state.messageSignatureVerified = false;
  ctx.state.auth = { ...ctx.state.auth, message_signature: pubKey ? 'required' : 'not_required' };
  if (pubKey) {
    const msgSignResult = await verifyHTTPSig(ctx, pubKey);
    abortOnInvalidHTTPSig(ctx, msgSignResult);
    ctx.state.messageSignatureVerified = true;
  }

  await next();
});

// handle authorized routes

router.get('/shapes', async ctx => {
  const shape = randomShape();
  ctx.body = {
    shape,
    status: ctx.state.messageSignatureVerified ?
      `${shape} (approoved with valid message signature)` :
      `${shape} (approoved without message signature)`
  };
});

export default router;
