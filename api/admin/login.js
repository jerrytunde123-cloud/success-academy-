const {
    handle,
    json,
    method,
    readJson,
    getClientIp,
    assertSameOrigin,
    HttpError
} = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { safeEqual, setSessionCookie } = require('../../lib/auth');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { RATE_LIMITS } = require('../../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    assertSameOrigin(req);
    await ensureSchema();
    await enforceRateLimit(
        'login:' + getClientIp(req),
        RATE_LIMITS.login.limit,
        RATE_LIMITS.login.windowSeconds
    );

    const configured = process.env.ADMIN_PASSWORD;
    if (!configured) {
        throw new HttpError(503, 'Admin login is not configured. Set ADMIN_PASSWORD in Vercel.');
    }

    const payload = await readJson(req, 4 * 1024);
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!password || !safeEqual(password, configured)) {
        throw new HttpError(401, 'Incorrect password.');
    }

    setSessionCookie(req, res);
    json(res, 200, { success: true, authenticated: true });
});
