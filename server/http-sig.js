// shapes api server - HTTP message signature verification

import { debug } from './utils.js';
// To add the following dependency to an ESM project, run:
// npm install git+https://github.com/misskey-dev/node-http-message-signatures.git
import { verifyDigestHeader, parseRequestSignature, verifyParsedSignature } from '@misskey-dev/node-http-message-signatures';

// verifyHTTPSig verifies the signature of an HTTP message using the public key provided.
//
// ctx: the context of the request as specified by Koa (https://koajs.com/#request)
// publicKey: the public key to use for verification (the message signing secret from the Approov account for account
//     message signing or the public key from the Approov token for device message signing)
// return: an object with the following properties:
//     valid: a boolean indicating whether the signature is valid or not
//     status: a string with the status of the verification
const verifyHTTPSig = async (ctx, publicKey) => {
    debug('>>> Check HTTP message signature <<<');

    // Check the digest header (pass the node request object (ctx.req), *not* the Koa request object (ctx.request))
    const digestVerified = await verifyDigestHeader(ctx.req.raw, ctx.req.body, true, (...args) => debug(args));
    if (!digestVerified) {
        return { valid: false, status: 'invalid digest header' };
    }

    // Check the signature
    let parsedSignature = null;
    try {
        // pass the node request object (ctx.req), *not* the Koa request object (ctx.request)
        parsedSignature = parseRequestSignature(ctx.req.raw);
    } catch (error) {
        return { valid: false, status: 'malformed message signature' };
    }

    // Verify the signature
    try {
        const signatureVerified = await verifyParsedSignature(parsedSignature, publicKey, (...args) => debug(args));
        if (!signatureVerified) {
            return { valid: false, status: 'invalid message signature' };
        }
    } catch (error) {
        return { valid: false, status: 'message signature error' };
    }
    return { valid: true, status: 'valid HTTP message signature' };
}

export { verifyHTTPSig };
