const { handle, json, method } = require('../../http');
const { getEmailJSPublicConfig } = require('../../emailjs');

// The same EmailJS template is used for admin replies and buyer receipts.
// These identifiers are public by design; no private key is exposed here.
module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }
    json(res, 200, getEmailJSPublicConfig());
});
