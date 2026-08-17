// shapes api server

import dotenv from 'dotenv';
import { readBooleanEnv } from './utils.js';
import { googleAnalyticsConfiguration, logEvent, usageTracking } from './observability.js';
import Koa from 'koa';
import cors from '@koa/cors';
import Router from '@koa/router';
import sslifyPackage, { xForwardedProtoResolver as xfpResolver } from 'koa-sslify';
import http from 'http';
import https from 'https';
import v1Router from './v1-routes.js';
import v3Router from './v3-routes.js';
import v5Router from './v5-routes.js';

// koa-sslify is CommonJS, so Node exposes its default export differently
// across supported package versions.
const sslify = sslifyPackage.default || sslifyPackage;

// ORDER OF THE ENV FILES MATTERS - existing environment takes precedence, then
// earlier files over later ones. Note that when running this with docker compose,
// these files have no effect because docker-compose has already applied them
// to the local environment as part of "docker-compose up".
dotenv.config({path: '.env', quiet: true});
dotenv.config({path: '.env.default', quiet: true});

const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const ENFORCE_HTTPS=(process.env.ENFORCE_HTTPS || 'true').toLowerCase() === 'true';
const HTTPS_MODE=(process.env.HTTPS_MODE || 'direct').toLowerCase();
const HTTPS_KEY=Buffer.from(process.env.HTTPS_KEY || '', 'base64');
const HTTPS_CRT=Buffer.from(process.env.HTTPS_CRT || '', 'base64');
const analyticsConfiguration = googleAnalyticsConfiguration();

logEvent(analyticsConfiguration.enabled && !analyticsConfiguration.valid ? 'error' : 'info', {
  event: 'analytics_configuration',
  provider: 'google_analytics',
  ...analyticsConfiguration
});

if (!['direct', 'x-forwarded-proto'].includes(HTTPS_MODE)) {
  throw new Error(`HTTPS_MODE '${HTTPS_MODE}' not recognized`);
}

if (HTTPS_MODE === 'direct' && ENFORCE_HTTPS && (HTTPS_KEY.length === 0 || HTTPS_CRT.length === 0)) {
  throw new Error('ENFORCE_HTTPS requires HTTPS_KEY and HTTPS_CRT in direct mode');
}

const app = new Koa();
app.proxy = readBooleanEnv('TRUST_PROXY', false);
app.use(usageTracking());
app.use(cors());

// handle errors

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      status: err.message
    }
    ctx.state.error = {
      name: err.name,
      message: err.message,
      status_code: ctx.status,
      stack: ctx.status >= 500 ? err.stack : undefined
    };
    if (ctx.status >= 500) {
      ctx.app.emit('error', err, ctx);
    }
  }
});

app.on('error', (err, ctx) => {
  logEvent('error', {
    event: 'request_error',
    request_id: ctx?.state?.requestId,
    error_name: err.name,
    error_message: err.message,
    error_stack: err.stack,
    status_code: err.status || 500
  });
});

// HTTPS enforcement must run before route handlers, which terminate the
// middleware chain once they have produced a response.
if (ENFORCE_HTTPS) {
  app.use(sslify(HTTPS_MODE === 'direct' ? {
    port: HTTPS_PORT
  } : {
    resolver: xfpResolver
  }));
}

const router = new Router();

router.get('/hello', async ctx => {
  ctx.body = 'Hello, World!';
});

app.use(router.routes());
app.use(router.allowedMethods());

// handle v1 API key protected routes

app.use(v1Router.routes());
app.use(v1Router.allowedMethods());

// handle v3 API key and Approov token protected routes

app.use(v3Router.routes());
app.use(v3Router.allowedMethods());

// handle v5 API key, Approov token, and message-signature protected routes

app.use(v5Router.routes());
app.use(v5Router.allowedMethods());

// start service

let httpServer, httpsServer;

if (HTTPS_MODE == 'direct') {

  logEvent('info', { event: 'server_starting', https_mode: 'direct' });

  if (ENFORCE_HTTPS) {
    logEvent('info', { event: 'server_listening', protocol: 'https', port: Number(HTTPS_PORT) });
    httpsServer = https.createServer({key: HTTPS_KEY, cert: HTTPS_CRT}, app.callback())
    .listen({ port: HTTPS_PORT}, () => {
      logEvent('info', { event: 'server_ready', protocol: 'https', port: httpsServer.address().port });
    })
    .on('error', err => {
      logEvent('error', { event: 'server_error', protocol: 'https', error_message: err.message });
    });
  }

  logEvent('info', { event: 'server_listening', protocol: 'http', port: Number(HTTP_PORT) });

  httpServer = http.createServer(app.callback())
  .listen({ port: HTTP_PORT}, () => {
    logEvent('info', { event: 'server_ready', protocol: 'http', port: httpServer.address().port });
  })
  .on('error', err => {
    logEvent('error', { event: 'server_error', protocol: 'http', error_message: err.message });
  });

} else {
  httpServer = http.createServer(app.callback())
  .listen({ port: HTTP_PORT}, () => {
    logEvent('info', { event: 'server_ready', protocol: 'http', port: httpServer.address().port });
  })
  .on('error', err => {
    logEvent('error', { event: 'server_error', protocol: 'http', error_message: err.message });
  });
}

// export service close function
export { httpServer, httpsServer };
