const test = require('node:test');
const assert = require('node:assert/strict');
const { createReq, createRes } = require('./helpers');

// Requiring paystack loads lib/http, which loads .env.local locally. The tests
// below set or delete the variables they care about explicitly.
const {
    FALLBACK_PAYSTACK_PUBLIC_KEY,
    getPaystackPublicKey
} = require('../lib/paystack');
const configApi = require('../api/config');

async function call(options) {
    const res = createRes();
    await configApi(createReq(options), res);
    return res;
}

test('getPaystackPublicKey() prefers PAYSTACK_PUBLIC_KEY', function () {
    process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_from_env';
    assert.equal(getPaystackPublicKey(), 'pk_test_from_env');
});

test('getPaystackPublicKey() falls back when the variable is missing', function () {
    delete process.env.PAYSTACK_PUBLIC_KEY;
    assert.equal(getPaystackPublicKey(), FALLBACK_PAYSTACK_PUBLIC_KEY);
});

test('GET /api/config returns the public key and payment status', async function () {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_config';
    process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_config';

    const res = await call({ method: 'GET' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.paystackPublicKey, 'pk_test_config');
    assert.equal(res.body.paymentsEnabled, true);
});

test('GET /api/config reports payments disabled without a secret key', async function () {
    delete process.env.PAYSTACK_SECRET_KEY;

    const res = await call({ method: 'GET' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.paymentsEnabled, false);
});

test('GET /api/config rejects other methods', async function () {
    const res = await call({ method: 'POST' });

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'GET');
});
