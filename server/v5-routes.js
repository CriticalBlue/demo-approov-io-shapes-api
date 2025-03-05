// shapes api server - v5 protected routes

import { debug } from './utils.js';
import Router from 'koa-router';
import { verifyApiKey } from './api-key.js';
import { verifyToken, verifyApproovAuthTokenBinding, verifyCustomPayloadWithToken } from './auth.js';
import { verifyHTTPSig } from './http-sig.js';

const ENFORCE_APPROOV = (process.env.ENFORCE_APPROOV || 'true') == 'true';
const APPROOV_MSG_SIGN_KEY=Buffer.from(process.env.APPROOV_ACCOUNT_MSG_SIGN_SECRET || '', 'base64');

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

  // This is designed to work with both, account message signing and device message signing. First we check whether the 
  // Approov token contains a public key claim. If it does, we use this to verify the HTTP signature. If it does not, we
  // use the account message signing secret to verify the HTTP signature.
  const pubKey = tokenResult.claims['dpk'];
  if (!pubKey) {
    pubKey = APPROOV_MSG_SIGN_KEY;
  }

  const msgSignResult = verifyHTTPSig(ctx, pubKey);
  abortOnInvalidHTTPSig(ctx, msgSignResult);

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
    status: `${shape} (approoved and api key valid)`
  };
});

export default router;
