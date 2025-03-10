// shapes api server

import dotenv from 'dotenv';
import { debug } from './utils.js';
import Koa from 'koa';
import cors from '@koa/cors';
import Router from 'koa-router';
import logger from 'koa-logger';
import sslify, { xForwardedProtoResolver as xfpResolver } from 'koa-sslify';
import http from 'http';
import https from 'https';
import v0Router from './v0-routes.js';
import v1Router from './v1-routes.js';
import v2Router from './v2-routes.js';
import v3Router from './v3-routes.js';
import v4Router from './v4-routes.js';
import v5Router from './v5-routes.js';

// ORDER OF THE ENV FILES MATTERS - existing environment takes precedence, then
// earlier files over later ones. Note that when running this with docker compose,
// these files have no effect because docker-compose has already applied them
// to the local environment as part of "docker-compose up".
dotenv.config({path: '.env', debug: true})
dotenv.config({path: '.env.default', debug: true});

const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const ENFORCE_HTTPS=(process.env.ENFORCE_HTTPS || 'true').toLowerCase() === 'true';
const HTTPS_MODE=(process.env.HTTPS_MODE || 'direct').toLowerCase();
const HTTPS_KEY=Buffer.from(process.env.HTTPS_KEY || '', 'base64');
const HTTPS_CRT=Buffer.from(process.env.HTTPS_CRT || '', 'base64');
const LOG = (process.env.ENABLE_LOGGING || 'true').toLowerCase() === 'true';
const app = new Koa();
app.use(cors());

// handle logging

if (LOG) app.use(logger());

// handle errors

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      status: err.message
    }
    ctx.app.emit('error', err, ctx);
  }
});

// handle default route

const invite = `
  <!DOCTYPE html>
    <html>
      <head>
        <meta name="robots" content="noindex">
      </head>
      <body>
        <h1>Approov Mobile App Authentication</h1>
        <p>
          To learn more about how Approov protects your APIs from malicious bots and tampered or fake apps, see
          <a href="https://approov.io">https://approov.io</a>.
        </p>
      </body>
    </html>
`;

const router = new Router();

router.get('/robots.txt', async ctx => {
    ctx.type = 'text/plain'
    ctx.body = "User-agent: *\nDisallow: /";
});

router.get('/', async ctx => {
  debug(`text: ${invite}`);
  ctx.type = 'html';
  ctx.body = invite;
});

app.use(router.routes());
app.use(router.allowedMethods());

// handle v0 original routes

app.use(v0Router.routes());
app.use(v0Router.allowedMethods());

// handle v1 unprotected routes

app.use(v1Router.routes());
app.use(v1Router.allowedMethods());

// handle v2 protected routes

app.use(v2Router.routes());
app.use(v2Router.allowedMethods());

// handle v3 protected routes

app.use(v3Router.routes());
app.use(v3Router.allowedMethods());

// handle v4 protected routes

app.use(v4Router.routes());
app.use(v4Router.allowedMethods());

// handle v5 protected routes

app.use(v5Router.routes());
app.use(v5Router.allowedMethods());

// start service

let httpServer, httpsServer;

if (HTTPS_MODE == 'direct') {

  console.log("Starting server in direct mode...")

  if (ENFORCE_HTTPS && (HTTPS_KEY.length === 0 || HTTPS_CRT.length === 0)) {
    console.error("ERROR: Enforce HTTPS is enable but is missing the certificate key pair.")
  } else if (ENFORCE_HTTPS) {
    console.log("Starting server on HTTPS port %s", HTTPS_PORT);
    app.use(sslify({
      port: HTTPS_PORT
    }));

    httpsServer = https.createServer({key: HTTPS_KEY, cert: HTTPS_CRT}, app.callback())
    .listen({ port: HTTPS_PORT}, () => {
      console.log(`Listening on HTTPS port ${HTTPS_PORT}...`);
    })
    .on('error', err => {
      console.error(`error: ${err}`);
    });
  }

  console.log("Starting server on http port %s", HTTP_PORT);

  httpServer = http.createServer(app.callback())
  .listen({ port: HTTP_PORT}, () => {
    console.log(`Listening on http port ${HTTP_PORT}...`);
  })
  .on('error', err => {
    console.error(`error: ${err}`);
  });

} else if (HTTPS_MODE == 'x-forwarded-proto') {
  if (ENFORCE_HTTPS) {
    app.use(sslify({
      resolver: xfpResolver
    }));
  }

  httpServer = http.createServer(app.callback())
  .listen({ port: HTTP_PORT}, () => {
    console.log(`Listening on http port ${HTTP_PORT}...`);
  })
  .on('error', err => {
    console.error(`error: ${err}`);
  });
} else {
  console.error(`ERROR: HTTPS_MODE \'${HTTPS_MODE}\' not recognized`);
}

// export service close function
export { httpServer, httpsServer };
