const { handle, getQuery, HttpError } = require('../../http');
const { text } = require('../../validate');
const { ensureSchema } = require('../../schema');
const { findByClaimToken, normalizeResultReference } = require('../../result-orders');
const { getProduct } = require('../../result-products');
const { buildVoucherPdf } = require('../../voucher-pdf');

module.exports = handle(async function (req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.statusCode = 405;
        res.end('Method not allowed');
        return;
    }

    await ensureSchema();
    const queryParams = getQuery(req);
    const reference = normalizeResultReference(queryParams.get('reference'));
    const token = text(queryParams.get('token'), 'token', { required: true, max: 64 });

    const order = await findByClaimToken(reference, token);
    if (!order) {
        throw new HttpError(404, 'This voucher link is invalid.');
    }

    const product = await getProduct(order.productId);
    const pdf = buildVoucherPdf({
        reference: order.reference,
        productName: product ? product.name : 'Result Checker PIN',
        date: order.createdAt,
        amount: order.amount / 100,
        pin: order.pin,
        serial: order.serial,
        instructions: product ? product.instructions : '',
        portalUrl: product ? product.portalUrl : ''
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="success-academy-' + reference + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
});
