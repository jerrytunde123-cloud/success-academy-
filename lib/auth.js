const crypto = require('crypto');
const { HttpError, json, assertSameOrigin } = require('./http');
const { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_SECONDS } = require('./constants');

function getSecret() {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
    if (!secret) {
        throw new HttpError(503, 'Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.');
    }
    return secret;
}

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
}

function signValue(value) {
    return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function safeEqual(left, right) {
    const leftHash = crypto.createHash('sha256').update(String(left)).digest();
    const rightHash = crypto.createHash('sha256').update(String(right)).digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
}

function signSession() {
    const now = Math.floor(Date.now() / 1000);
    const payload = base64UrlEncode(JSON.stringify({
        sub: 'admin',
        iat: now,
        exp: now + ADMIN_SESSION_TTL_SECONDS
    }));
    return payload + '.' + signValue(payload);
}

function verifySession(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }
    const separator = token.lastIndexOf('.');
    if (separator <= 0) {
        return null;
    }
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = signValue(payload);
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) {
        return null;
    }
    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return null;
    }
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!data || data.sub !== 'admin' || !Number.isInteger(data.exp)) {
            return null;
        }
        if (data.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }
        return data;
    } catch (_err) {
        return null;
    }
}

function parseCookies(header) {
    const cookies = {};
    if (!header) {
        return cookies;
    }
    String(header).split(';').forEach(function (part) {
        const separator = part.indexOf('=');
        if (separator === -1) {
            return;
        }
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key) {
            try {
                cookies[key] = decodeURIComponent(value);
            } catch (_err) {
                cookies[key] = value;
            }
        }
    });
    return cookies;
}

function isSecureRequest(req) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (proto === 'https') {
        return true;
    }
    const vercelEnv = String(process.env.VERCEL_ENV || '');
    return vercelEnv === 'production' || vercelEnv === 'preview';
}

function serializeCookie(name, value, maxAge, secure) {
    const parts = [
        name + '=' + encodeURIComponent(value),
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=' + maxAge
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

function setSessionCookie(req, res) {
    res.setHeader(
        'Set-Cookie',
        serializeCookie(ADMIN_COOKIE_NAME, signSession(), ADMIN_SESSION_TTL_SECONDS, isSecureRequest(req))
    );
}

function clearSessionCookie(req, res) {
    res.setHeader('Set-Cookie', serializeCookie(ADMIN_COOKIE_NAME, '', 0, isSecureRequest(req)));
}

function requireAdmin(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        assertSameOrigin(req);
    }

    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies[ADMIN_COOKIE_NAME]);
    if (!session) {
        json(res, 401, { error: 'Unauthorized' });
        return false;
    }
    return true;
}

module.exports = {
    getSecret,
    safeEqual,
    signSession,
    verifySession,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    requireAdmin
};
