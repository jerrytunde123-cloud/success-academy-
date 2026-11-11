const { handle, json, method, readJson, getClientIp } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { createEnquiry } = require('../lib/enquiries');
const { normalizeEnquiryInput } = require('../lib/validate');
const { enforceRateLimit } = require('../lib/rate-limit');
const { RATE_LIMITS } = require('../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'enquiry:' + getClientIp(req),
        RATE_LIMITS.enquiry.limit,
        RATE_LIMITS.enquiry.windowSeconds
    );

    const payload = await readJson(req, 32 * 1024);
    const input = normalizeEnquiryInput(payload);

    // Hidden field used only by bots.
    if (input.honeypot) {
        json(res, 200, { success: true });
        return;
    }

    await createEnquiry(input);
    json(res, 200, { success: true });
});
