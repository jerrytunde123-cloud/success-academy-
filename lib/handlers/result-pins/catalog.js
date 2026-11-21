const { handle, json, method } = require('../../http');
const { ensureSchema } = require('../../schema');
const { listProducts } = require('../../result-products');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }
    await ensureSchema();
    json(res, 200, { success: true, products: await listProducts({ includeActiveOnly: true }) });
});
