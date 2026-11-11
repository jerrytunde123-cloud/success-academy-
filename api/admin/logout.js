const { handle, json, method } = require('../../lib/http');
const { requireAdmin, clearSessionCookie } = require('../../lib/auth');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    clearSessionCookie(req, res);
    json(res, 200, { success: true });
});
