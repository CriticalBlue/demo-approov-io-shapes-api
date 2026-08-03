// shapes api server - HTTP message signature verification

import { createPublicKey } from 'crypto';
import { debug } from './utils.js';
// To add the following dependency to an ESM project, run:
// npm install git+https://github.com/misskey-dev/node-http-message-signatures.git
import { verifyDigestHeader, parseRequestSignature, verifyParsedSignature } from '@misskey-dev/node-http-message-signatures';

const REQUIRED_SIGNATURE_COMPONENTS = ['@method', '@path'];

const publicKeyPEMFromClaim = (publicKey) => {
    if (typeof publicKey !== 'string' || publicKey.length === 0 || publicKey.length > 4096) {
        throw new Error('invalid public key claim');
    }

    const unpadded = publicKey.replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey) || publicKey.length % 4 === 1) {
        throw new Error('invalid public key encoding');
    }

    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    if (publicKeyBuffer.length === 0 || publicKeyBuffer.toString('base64').replace(/=+$/, '') !== unpadded) {
        throw new Error('non-canonical public key encoding');
    }

    const publicKeyObject = createPublicKey({
        key: publicKeyBuffer,
        format: 'der',
        type: 'spki'
    });
    if (publicKeyObject.asymmetricKeyType !== 'ec' || publicKeyObject.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
        throw new Error('message signing requires an EC P-256 public key');
    }

    return publicKeyObject.export({ type: 'spki', format: 'pem' });
};

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

    let publicKeyPEM;
    try {
        publicKeyPEM = publicKeyPEMFromClaim(publicKey);
    } catch (error) {
        debug(`Invalid message signature public key: ${error}`);
        return { valid: false, status: 'invalid message signature public key' };
    }
    debug(`Public Key ASN.1 Base64: ${publicKey}`);
    debug(`Public Key PEM: ${publicKeyPEM}`);
    
    // Check the digest header if it exists (pass the node request object (ctx.req), *not* the Koa request object (ctx.request))
    if (ctx.req.headers['content-digest'] || ctx.req.headers['digest']) {
        const requestBody = ctx.request.rawBody || '';
        const digestVerified = await verifyDigestHeader(ctx.req, requestBody, true, (...args) => debug(args.map(arg => JSON.stringify(arg)).join(' ')));
        if (!digestVerified) {
            return { valid: false, status: 'invalid digest header' };
        }
    }

    // Check the signature
    let parsedSignature = null;
    try {
        // pass the node request object (ctx.req), *not* the Koa request object (ctx.request)
        parsedSignature = parseRequestSignature(ctx.req, {
            requiredComponents: {
                rfc9421: REQUIRED_SIGNATURE_COMPONENTS
            }
        });
        if (parsedSignature.version !== 'rfc9421') {
            return { valid: false, status: 'unsupported message signature format' };
        }
        debug(`Parsed Signature: ${JSON.stringify(parsedSignature, null, 2)}`);
    } catch (error) {
        debug(`Malformed message signature: ${error}`);
        debug(`Request Headers: ${JSON.stringify(ctx.req.headers, null, 2)}`);
        return { valid: false, status: 'malformed message signature' };
    }

    // Verify the signature
    try {
        const signatureVerified = await verifyParsedSignature(parsedSignature, publicKeyPEM, (...args) => debug(args));
        if (!signatureVerified) {
            debug(`Request Headers: ${JSON.stringify(ctx.req.headers, null, 2)}`);
            return { valid: false, status: 'invalid message signature' };
        }
    } catch (error) {
        debug(`Message signature error: ${error}`);
        debug(`Request Headers: ${JSON.stringify(ctx.req.headers, null, 2)}`);
        return { valid: false, status: 'message signature error' };
    }
    debug(`Request Headers: ${JSON.stringify(ctx.req.headers, null, 2)}`);
    return { valid: true, status: 'valid HTTP message signature' };
}

export { verifyHTTPSig };
