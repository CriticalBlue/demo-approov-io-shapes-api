// shapes api server - HTTP message signature verification

import { createPublicKey } from 'crypto';
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

    // Convert the EC256 public key from base64 encoded ASN.1 DER to a Node key object and/or PEM encoded key for use by
    // verifyParsedSignature
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    // TODO Find a public key object format accepted by verifyParsedSignature
    // const publicKeyObject = createPublicKey({
    //     key: publicKeyBuffer,
    //     format: 'der',
    //     type: 'spki'
    // });
    // const publicKeyObject = createPublicKey(publicKeyBuffer);
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${publicKeyBuffer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
    debug(`Public Key ASN.1 Base64: ${publicKey}`);
    debug(`Public Key PEM: ${publicKeyPEM}`);
    
    // Check the digest header if it exists (pass the node request object (ctx.req), *not* the Koa request object (ctx.request))
    if (ctx.req.headers['content-digest'] || ctx.req.headers['digest']) {
        const requestBody = ctx.body || '';
        const digestVerified = await verifyDigestHeader(ctx.req, requestBody, true, (...args) => debug(args.map(arg => JSON.stringify(arg)).join(' ')));
        if (!digestVerified) {
            return { valid: false, status: 'invalid digest header' };
        }
    }

    // Check the signature
    let parsedSignature = null;
    try {
        // pass the node request object (ctx.req), *not* the Koa request object (ctx.request)
        parsedSignature = parseRequestSignature(ctx.req);
    } catch (error) {
        debug(`Malformed message signature: ${error}`);
        debug('Request Headers:', JSON.stringify(ctx.req.headers, null, 2));
        return { valid: false, status: 'malformed message signature' };
    }

    // Verify the signature
    try {
        const signatureVerified = await verifyParsedSignature(parsedSignature, publicKeyPEM, (...args) => debug(args));
        if (!signatureVerified) {
            return { valid: false, status: 'invalid message signature' };
        }
    } catch (error) {
        debug(`Message signature error: ${error}`);
        debug('Request Headers:', JSON.stringify(ctx.req.headers, null, 2));
        return { valid: false, status: 'message signature error' };
    }
    return { valid: true, status: 'valid HTTP message signature' };
}

export { verifyHTTPSig };
