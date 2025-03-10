// shapes api server - unprotected routes

import { debug } from './utils.js';
import Router from 'koa-router';

// handle routes

const router = new Router();

const hello = 'Hello, World!';

router.get('/hello', async ctx => {
  debug(`text: ${hello}`);
  ctx.body = hello;
});

const shapes = [ 'Circle', 'Rectangle', 'Square', 'Triangle' ];

router.get('/shapes', async ctx => {
  const shape = shapes[Math.floor((Math.random() * shapes.length))];
  debug(`shape: ${shape}`);
  ctx.body = shape;
});

export default router;
