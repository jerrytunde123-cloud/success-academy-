const { handle, json, method, readJson, getClientIp } = require('../../http');
const { text } = require('../../validate');
const { ensureSchema } = require('../../schema');
const {
    normalizeResultReference,
    recordEmailed
} = require('../../result-orders');
const { enforceRateLimit } = require('../../rate-limit');
const { RATE_LIMITS } = require('../../constants');

// The browser sends the receipt through EmailJS. This endpoint only records
// that the buyer's browser reported a successful send.
module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'result-email:' + getClientIp(req),
        RATE_LIMITS.resultEmail.limit,
        RATE_LIMITS.resultEmail.windowSeconds
    );

    const payload = await readJson(req, 16 * 1024);
    const reference = normalizeResultReference(payload.reference);
    const token = text(payload.token, 'token', { required: true, max: 64 });

    await recordEmailed(reference, token);
    json(res, 200, { success: true });
});
