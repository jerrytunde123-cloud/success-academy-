const { handle, json, method, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { listOrders, deleteOrder } = require('../../orders');
const { normalizeLimit, text } = require('../../validate');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'DELETE'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();
    const queryParams = getQuery(req);

    if (req.method === 'GET') {
        const limit = normalizeLimit(queryParams.get('limit'), 500, 2000);
        json(res, 200, await listOrders(limit));
        return;
    }

    const reference = text(queryParams.get('reference'), 'reference', { required: true, max: 64 });
    if (!/^SA_[A-F0-9]{16}$/.test(reference)) {
        throw new HttpError(400, 'Order reference is invalid.');
    }
    if (!await deleteOrder(reference)) {
        throw new HttpError(404, 'Order not found.');
    }
    json(res, 200, { success: true });
});
