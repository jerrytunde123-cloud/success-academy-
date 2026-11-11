const { HttpError } = require('./http');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Public key that was previously hardcoded in the frontend. It is only used
// when PAYSTACK_PUBLIC_KEY is not set; the environment variable always wins.
const FALLBACK_PAYSTACK_PUBLIC_KEY = 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043';

function isPaystackConfigured() {
    return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function getPaystackPublicKey() {
    const configured = String(process.env.PAYSTACK_PUBLIC_KEY || '').trim();
    return configured || FALLBACK_PAYSTACK_PUBLIC_KEY;
}

async function paystackRequest(path, options) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
        throw new HttpError(503, 'Payments are not configured. Set PAYSTACK_SECRET_KEY in Vercel.');
    }

    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, 10000);

    try {
        const response = await fetch(PAYSTACK_BASE_URL + path, {
            method: (options && options.method) || 'GET',
            headers: Object.assign({
                Authorization: 'Bearer ' + secretKey,
                'Content-Type': 'application/json'
            }, (options && options.headers) || {}),
            body: options && options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal
        });

        let data;
        try {
            data = await response.json();
        } catch (_err) {
            data = {};
        }

        if (!response.ok || data.status === false) {
            throw new HttpError(502, data.message || 'Payment provider request failed.');
        }

        return data.data;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new HttpError(504, 'Payment provider timed out. Please try again.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function initializeTransaction(input) {
    return paystackRequest('/transaction/initialize', {
        method: 'POST',
        body: {
            email: input.email,
            amount: input.amountKobo,
            currency: 'NGN',
            reference: input.reference,
            callback_url: input.callbackUrl,
            metadata: input.metadata || {}
        }
    });
}

async function verifyTransaction(reference) {
    return paystackRequest('/transaction/verify/' + encodeURIComponent(reference), {
        method: 'GET'
    });
}

module.exports = {
    PAYSTACK_BASE_URL,
    FALLBACK_PAYSTACK_PUBLIC_KEY,
    isPaystackConfigured,
    getPaystackPublicKey,
    paystackRequest,
    initializeTransaction,
    verifyTransaction
};
