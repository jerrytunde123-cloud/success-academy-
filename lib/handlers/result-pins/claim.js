const { handle, json, method, readJson, getClientIp, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { normalizeDeviceId } = require('../../domain');
const {
    normalizeResultReference,
    getResultOrder,
    markResultOrderPaid
} = require('../../result-orders');
const { getProduct } = require('../../result-products');
const { isPaystackConfigured, verifyTransaction } = require('../../paystack');
const { enforceRateLimit } = require('../../rate-limit');
const { RATE_LIMITS } = require('../../constants');

async function responseForOrder(order) {
    const product = await getProduct(order.productId);
    return {
        success: true,
        reference: order.reference,
        productId: order.productId,
        productName: product ? product.name : 'Result Checker PIN',
        email: order.email,
        pin: order.pin,
        serial: order.serial,
        portalUrl: product ? product.portalUrl : '',
        instructions: product ? product.instructions : '',
        amount: order.amount / 100,
        date: order.createdAt,
        claimToken: order.claimToken
    };
}

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'result-claim:' + getClientIp(req),
        RATE_LIMITS.resultClaim.limit,
        RATE_LIMITS.resultClaim.windowSeconds
    );

    const payload = await readJson(req, 16 * 1024);
    const reference = normalizeResultReference(payload.reference);
    const deviceId = normalizeDeviceId(payload.deviceId);

    const order = await getResultOrder(reference);
    if (!order) {
        throw new HttpError(404, 'Payment reference not found.');
    }
    if (order.deviceId !== deviceId) {
        throw new HttpError(403, 'This payment belongs to a different device.');
    }
    if (order.status === 'paid') {
        json(res, 200, await responseForOrder(order));
        return;
    }
    if (order.status !== 'pending') {
        throw new HttpError(409, 'This payment is no longer pending.');
    }
    if (!isPaystackConfigured()) {
        throw new HttpError(503, 'Payments are not configured.');
    }

    const transaction = await verifyTransaction(reference);
    if (!transaction || transaction.status !== 'success') {
        throw new HttpError(402, 'The payment has not been completed.');
    }
    if (String(transaction.reference || '').toUpperCase() !== reference) {
        throw new HttpError(400, 'Payment reference mismatch.');
    }
    if (Number(transaction.amount) !== order.amount) {
        throw new HttpError(400, 'Payment amount mismatch.');
    }
    if (String(transaction.currency || '').toUpperCase() !== order.currency) {
        throw new HttpError(400, 'Payment currency mismatch.');
    }

    const paidOrder = await markResultOrderPaid(reference);
    json(res, 200, await responseForOrder(paidOrder));
});
