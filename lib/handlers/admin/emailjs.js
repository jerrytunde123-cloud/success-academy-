const { handle, json, method } = require('../../http');
const { requireAdmin } = require('../../auth');
const { getEmailJSPublicConfig } = require('../../emailjs');

// Public identifiers for the browser-side EmailJS SDK, restricted to admins
// so anonymous visitors cannot discover or use the configured email template.
module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    json(res, 200, getEmailJSPublicConfig());
});
