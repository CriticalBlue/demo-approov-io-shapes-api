// shapes api server - v2 api key protected routes

const { debug } = require('./utils');
const Router = require('@koa/router');
const { verifyApiKey } = require('./api-key');

const abortOnInvalidApiKey = (ctx) => {
  const { valid, status } = verifyApiKey(ctx);

  if (!valid) {
    debug(`api key validation failed: ${status} - error`);
    ctx.throw(400, status);
  }

  debug(`api key is valid`);
}

// handle routes

const router = new Router({
  prefix: '/v1'
});

// authorize routes

router.use('/shapes', async (ctx, next) => {
  abortOnInvalidApiKey(ctx);

  await next();
});

router.use(['/forms'], async (ctx, next) => {
  abortOnInvalidApiKey(ctx);

  await next();
});

const hello = 'Hello, World!';

router.get('/hello', async ctx => {
  debug(`text: ${hello}`);
  ctx.body = {
    text: hello,
    status: `${hello}`
  };
});

const shapes = [ 'Circle', 'Rectangle', 'Square', 'Triangle' ];

router.get('/shapes', async ctx => {
  const shape = shapes[Math.floor((Math.random() * shapes.length))];
  debug(`shape: ${shape}`);
  ctx.body = {
    shape,
    status: `${shape} (api key protected)`
  };
});

const forms = [ 'Box', 'Cone', 'Cube', 'Sphere' ];

router.get('/forms', async ctx => {
  const form = forms[Math.floor((Math.random() * forms.length))];
  debug(`form: ${form}`);
  ctx.body = {
    form,
    status: `${form} (api key protected)`
  };
});

module.exports = router;

// end of file
