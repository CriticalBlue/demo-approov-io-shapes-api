// shapes api server - v1 API key protected routes

import Router from '@koa/router';
import { requireApiKey } from './access-control.js';
import { randomShape } from './shapes.js';

// handle routes

const router = new Router({
  prefix: '/v1'
});

// authorize routes

router.use('/shapes', async (ctx, next) => {
  requireApiKey(ctx);

  await next();
});

router.get('/shapes', async ctx => {
  const shape = randomShape();
  ctx.body = {
    shape,
    status: `${shape} (api key protected)`
  };
});

export default router;
