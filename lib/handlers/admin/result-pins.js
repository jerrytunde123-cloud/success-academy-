const { handle, json, method, readJson, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { normalizeId, normalizeNumericId, normalizeLimit, text } = require('../../validate');
const {
    listProducts,
    getProduct,
    normalizeProductUpdate,
    updateProduct
} = require('../../result-products');
const { addPins, listStock, deletePin } = require('../../result-pins');
const {
    listResultOrders,
    deleteResultOrder,
    normalizeResultReference
} = require('../../result-orders');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'POST'])) {
        return;
    }
    if (!requireAdmin(req, res)) {
        return;
    }
    await ensureSchema();

    if (req.method === 'GET') {
        const limit = normalizeLimit(getQuery(req).get('limit'), 500, 2000);
        json(res, 200, {
            success: true,
            products: await listProducts(),
            stock: await listStock({ limit: limit }),
            orders: await listResultOrders(limit)
        });
        return;
    }

    const payload = await readJson(req, 128 * 1024);
    const action = text(payload.action, 'action', { required: true, max: 50 });

    if (action === 'saveProducts') {
        const updates = payload.products;
        if (!Array.isArray(updates) || updates.length === 0 || updates.length > 20) {
            throw new HttpError(400, 'Provide between 1 and 20 products.');
        }
        const products = [];
        for (const update of updates) {
            products.push(await updateProduct(normalizeProductUpdate(update)));
        }
        json(res, 200, { success: true, products: products });
        return;
    }

    if (action === 'addPins') {
        const productId = normalizeId(payload.productId, 'productId');
        const product = await getProduct(productId);
        if (!product) {
            throw new HttpError(404, 'Result product not found.');
        }
        const result = await addPins({
            product: product,
            lines: text(payload.lines, 'lines', { required: true, max: 20000 }),
            batch: text(payload.batch, 'batch', { max: 100, defaultValue: '' })
        });
        json(res, 200, Object.assign({ success: true }, result));
        return;
    }

    if (action === 'deletePin') {
        const id = normalizeNumericId(payload.id, 'id');
        if (!await deletePin(id)) {
            throw new HttpError(404, 'PIN not found.');
        }
        json(res, 200, { success: true });
        return;
    }

    if (action === 'deleteOrder') {
        const reference = normalizeResultReference(payload.reference);
        if (!await deleteResultOrder(reference)) {
            throw new HttpError(404, 'Order not found.');
        }
        json(res, 200, { success: true });
        return;
    }

    throw new HttpError(400, 'Unknown action.');
});
