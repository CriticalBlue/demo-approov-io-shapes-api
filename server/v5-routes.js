// shapes api server - v5 protected routes

import { debug } from './utils.js';
import Router from 'koa-router';
// TODO remove API key check?
import { verifyApiKey } from './api-key.js';
// TODO support token binding and custom payload verification?
import { verifyToken, verifyApproovAuthTokenBinding, verifyCustomPayloadWithToken } from './auth.js';
import { verifyHTTPSig } from './http-sig.js';

const ENFORCE_APPROOV = (process.env.ENFORCE_APPROOV || 'true') == 'true';

// API key, approov token, and HTTP message signature checks

const abortOnInvalidApiKey = (ctx) => {
  const { valid, status } = verifyApiKey(ctx);

  if (!valid) {
    debug(`api key validation failed: ${status} - error`);
    ctx.throw(400, status);
  }

  debug(`api key is valid`);
}

const abortOnInvalidApproovToken = (ctx, { valid, status }) => {
  if (!valid) {
    if (ENFORCE_APPROOV) {
      debug(`authorization failed: ${status} - error`);
      ctx.throw(400, status);
    } else {
      debug(`authorization failed: ${status} - warning only`);
    }
  } else {
    debug('authorization passed');
  }
}

const abortOnInvalidHTTPSig = (ctx, { valid, status }) => {
  if (!valid) {
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
  abortOnInvalidApiKey(ctx);

  // Check the Approov token and extract the token claims
  const tokenResult = verifyToken(ctx);
  abortOnInvalidApproovToken(ctx, tokenResult);

  // Check whether the Approov token contains an installation public key (ipk) claim. If it does, we use this to verify
  // the HTTP signature. If it does not, we know that the message has no signature that we should check in the demo
  // server and accept the message.
  const pubKey = tokenResult.claims['ipk'];
  if (pubKey) {
    const msgSignResult = await verifyHTTPSig(ctx, pubKey);
    abortOnInvalidHTTPSig(ctx, msgSignResult);
  }

  await next();
});

// handle authorized routes

const hello = 'Hello, World!';

router.get('/hello', async ctx => {
  debug(`text: ${hello}`);
  ctx.body = {
    text: hello,
    status: `${hello} (healthy)`
  };
});

const shapes = [ 'Circle', 'Rectangle', 'Square', 'Triangle' ];

router.get('/shapes', async ctx => {
  const shape = shapes[Math.floor((Math.random() * shapes.length))];
  debug(`shape: ${shape}`);
  ctx.body = {
    shape,
    status: `${shape} (approoved with valid message signature)`
  };
});

export default router;
