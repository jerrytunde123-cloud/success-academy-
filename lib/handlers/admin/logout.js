const { handle, json, method } = require('../../http');
const { requireAdmin, clearSessionCookie } = require('../../auth');

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
