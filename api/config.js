// Public, non-secret configuration for the browser.
// The Paystack public key is safe to expose; the secret key is never returned.
const { handle, json, method } = require('../lib/http');
const { getPaystackPublicKey, isPaystackConfigured } = require('../lib/paystack');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    json(res, 200, {
        paystackPublicKey: getPaystackPublicKey(),
        paymentsEnabled: isPaystackConfigured()
    });
});
