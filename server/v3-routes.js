// shapes api server - v3 protected routes

import Router from '@koa/router';
import { requireApiKey, requireApproovToken } from './access-control.js';
import { randomShape } from './shapes.js';

// handle routes

const router = new Router({
  prefix: '/v3'
});

router.use('/shapes', async (ctx, next) => {
  requireApproovToken(ctx);
  requireApiKey(ctx);

  await next();
});

router.get('/shapes', async ctx => {
  const shape = randomShape();
  ctx.body = {
    shape,
    status: `${shape} (approoved and api key valid)`
  };
});

export default router;
