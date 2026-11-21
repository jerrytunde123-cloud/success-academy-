const { handle, json, method, readJson, getClientIp, getBaseUrl, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { normalizeId } = require('../../validate');
const { normalizeDeviceId, normalizeEmail } = require('../../domain');
const { getProduct } = require('../../result-products');
const { createPendingResultOrder, markResultOrderFailed } = require('../../result-orders');
const { isPaystackConfigured, initializeTransaction } = require('../../paystack');
const { enforceRateLimit } = require('../../rate-limit');
const { RATE_LIMITS } = require('../../constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'result-checkout:' + getClientIp(req),
        RATE_LIMITS.resultCheckout.limit,
        RATE_LIMITS.resultCheckout.windowSeconds
    );

    if (!isPaystackConfigured()) {
        throw new HttpError(503, 'Payments are not available yet. Please contact support.');
    }

    const payload = await readJson(req, 16 * 1024);
    const productId = normalizeId(payload.productId, 'productId');
    const deviceId = normalizeDeviceId(payload.deviceId);
    const email = normalizeEmail(payload.email);

    const product = await getProduct(productId, { availableOnly: true });
    if (!product) {
        throw new HttpError(404, 'This result PIN product is not available.');
    }
    if (product.available === 0) {
        throw new HttpError(409, 'This product is out of stock. Please check back later.');
    }

    const order = await createPendingResultOrder({
        product: product,
        deviceId: deviceId,
        email: email
    });

    try {
        const transaction = await initializeTransaction({
            email: email,
            amountKobo: order.amount,
            reference: order.reference,
            callbackUrl: getBaseUrl(req) + '/result-pins',
            metadata: {
                orderReference: order.reference,
                productId: product.id
            }
        });
        if (!transaction || !transaction.authorization_url) {
            throw new HttpError(502, 'Paystack did not return a checkout URL.');
        }
        json(res, 200, {
            success: true,
            reference: order.reference,
            authorizationUrl: transaction.authorization_url,
            accessCode: transaction.access_code || null,
            amount: product.price,
            currency: order.currency
        });
    } catch (err) {
        try {
            await markResultOrderFailed(order.reference);
        } catch (markErr) {
            console.error('[result-checkout] Could not mark order as failed:', markErr.message);
        }
        throw err;
    }
});
