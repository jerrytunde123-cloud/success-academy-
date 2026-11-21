const { handle, json, method } = require('../../http');
const { getResultEmailJSConfig } = require('../../emailjs');

// EmailJS public identifiers for the buyer receipt template. These are public
// by design; no private key or admin template is exposed here.
module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }
    json(res, 200, getResultEmailJSConfig());
});
