// shapes api server - Approov token verification

import { debug, readBooleanEnv } from './utils.js';
import jwt from 'jsonwebtoken';

const approovTokenHeader = 'Approov-Token'.toLowerCase();

const verifyToken = (ctx) => {
  debug('>>> Check Approov token <<<');

  const APPROOV_SECRET=Buffer.from(process.env.APPROOV_SECRET || '', 'base64');
  const approovToken = ctx.headers[approovTokenHeader];
  if (!approovToken) {
    return { valid: false, status: 'missing approov token' };
  }
  let claims = null;
  if (readBooleanEnv('ALLOW_DEBUG_TOKENS', false) && approovToken.startsWith('{')) {
    // permit dummy approov token which is just the JSON claims string
    try {
      claims = JSON.parse(approovToken);
      debug('succeeded dummy approov token JSON decode');
    } catch (error) {
      debug(`failed dummy approov token JSON decode: ${error}`);
      return { valid: false, status: 'failed dummy approov token JSON decode' };
    }
  } else {
    try {
      claims = jwt.verify(approovToken, APPROOV_SECRET, {algorithms: ['HS256']});
    } catch(err) {
      return { valid: false, status: 'invalid approov token' };
    }
  }
  return { valid: true, status: 'valid approov token', claims };
}

export { verifyToken };
