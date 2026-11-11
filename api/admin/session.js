const { handle, json, method } = require('../../lib/http');
const { requireAdmin } = require('../../lib/auth');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    json(res, 200, { authenticated: true });
});
