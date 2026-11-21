const {
    handle,
    json,
    method,
    readJson,
    getClientIp,
    assertSameOrigin,
    HttpError
} = require('../../http');
const { ensureSchema } = require('../../schema');
const { safeEqual, setSessionCookie, clearSessionCookie } = require('../../auth');
const { enforceRateLimit, recordLoginFailure, clearLoginFailures } = require('../../rate-limit');
const { RATE_LIMITS } = require('../../constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    assertSameOrigin(req);
    await ensureSchema();

    const ip = getClientIp(req);

    // --- BRUTE-FORCE PROTECTION START ---
    // Check if IP is currently locked out
    const lockState = await recordLoginFailure(ip);
    if (lockState.isLocked) {
        return json(res, 429, {
            error: 'Account locked due to too many failed attempts.',
            retryAfter: lockState.retryAfter,
            lockedUntil: lockState.lockedUntil
        });
    }
    // --- BRUTE-FORCE PROTECTION END ---

    await enforceRateLimit(
        'login:' + ip,
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
        // Record the failed attempt (but don't block yet—rate limit may already have thrown)
        await recordLoginFailure(ip);
        throw new HttpError(401, 'Incorrect password.');
    }

    // Clear any previous failed attempts for this IP on successful login
    await clearLoginFailures(ip);

    setSessionCookie(req, res);
    json(res, 200, { success: true, authenticated: true });
});