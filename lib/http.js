// Small HTTP helpers shared by every serverless function.

// Load local-only environment variables (for example Paystack test keys) when
// running under `vercel dev`. Values that are already set always win.
require('./env');

class HttpError extends Error {
    constructor(status, message, options) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        if (options && options.retryAfter) {
            this.retryAfter = options.retryAfter;
        }
    }
}

function json(res, status, data) {
    if (res.headersSent) {
        return;
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
}

function method(req, res, allowed) {
    if (allowed.indexOf(req.method) !== -1) {
        return true;
    }
    res.setHeader('Allow', allowed.join(', '));
    json(res, 405, { error: 'Method not allowed' });
    return false;
}

async function readJson(req, limit) {
    const maxBytes = limit || 1024 * 1024;

    if (req.body) {
        if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
            return req.body;
        }
        // Some runtimes populate req.body with the raw JSON text or a Buffer.
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
            const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
            if (!raw.trim()) {
                return {};
            }
            try {
                return JSON.parse(raw);
            } catch (_err) {
                throw new HttpError(400, 'Invalid JSON body');
            }
        }
    }

    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) {
            throw new HttpError(413, 'Request body is too large');
        }
        chunks.push(buffer);
    }

    if (size === 0) {
        return {};
    }

    let text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim()) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch (_err) {
        throw new HttpError(400, 'Invalid JSON body');
    }
}

function getQuery(req) {
    try {
        return new URL(req.url || '/', 'http://localhost').searchParams;
    } catch (_err) {
        return new URLSearchParams();
    }
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return String(realIp).trim();
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function getBaseUrl(req) {
    const configured = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (configured) {
        return configured;
    }

    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
    return proto + '://' + host;
}

function getRequestHost(req) {
    return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
}

function isSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) {
        return true;
    }

    try {
        return new URL(origin).host === getRequestHost(req);
    } catch (_err) {
        return false;
    }
}

function assertSameOrigin(req) {
    if (!isSameOrigin(req)) {
        throw new HttpError(403, 'Cross-origin request blocked');
    }
}

function handle(fn) {
    return async function (req, res) {
        try {
            await fn(req, res);
        } catch (err) {
            if (res.headersSent) {
                return;
            }

            const status = err instanceof HttpError ? err.status : 500;
            if (status >= 500) {
                console.error('[api] ' + req.method + ' ' + (req.url || '') + ' failed:', err);
            }
            if (err && err.retryAfter) {
                res.setHeader('Retry-After', String(err.retryAfter));
            }

            let message = err && err.message ? err.message : 'Unexpected error';
            if (status >= 500 && process.env.NODE_ENV === 'production') {
                message = 'Internal server error';
            }
            json(res, status, { error: message });
        }
    };
}

module.exports = {
    HttpError,
    json,
    method,
    readJson,
    getQuery,
    getClientIp,
    getBaseUrl,
    getRequestHost,
    isSameOrigin,
    assertSameOrigin,
    handle
};
