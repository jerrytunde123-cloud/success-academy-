const { handle, json, method, readJson, getQuery, HttpError } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { listEnquiries, getEnquiry, markEnquiryReplied } = require('../../lib/enquiries');
const { normalizeReplyInput, normalizeLimit } = require('../../lib/validate');
const { sendReplyEmail } = require('../../lib/email');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'POST'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();

    if (req.method === 'GET') {
        const limit = normalizeLimit(getQuery(req).get('limit'), 500, 1000);
        json(res, 200, await listEnquiries(limit));
        return;
    }

    const payload = await readJson(req, 32 * 1024);
    const reply = normalizeReplyInput(payload);
    const enquiry = await getEnquiry(reply.id);
    if (!enquiry) {
        throw new HttpError(404, 'Enquiry not found.');
    }

    if (payload.markOnly === true) {
        await markEnquiryReplied(enquiry.id);
        json(res, 200, { success: true, emailed: false, enquiryId: enquiry.id });
        return;
    }

    await sendReplyEmail({
        to: enquiry.email,
        name: enquiry.name,
        message: reply.message
    });
    await markEnquiryReplied(enquiry.id);

    json(res, 200, { success: true, emailed: true, enquiryId: enquiry.id });
});
