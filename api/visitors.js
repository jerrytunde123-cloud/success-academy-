const { handle, json, method, getClientIp } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { recordVisit } = require('../lib/visitors');
const { enforceRateLimit } = require('../lib/rate-limit');
const { RATE_LIMITS } = require('../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'visitor:' + getClientIp(req),
        RATE_LIMITS.visitor.limit,
        RATE_LIMITS.visitor.windowSeconds
    );
    await recordVisit();
    json(res, 200, { success: true });
});
