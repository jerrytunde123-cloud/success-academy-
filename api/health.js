const { handle, json, method } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { isDbConfigured, query } = require('../lib/db');
const { isPaystackConfigured } = require('../lib/paystack');
const { isR2Configured } = require('../lib/r2');
const { isEmailConfigured } = require('../lib/email');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    const result = {
        ok: false,
        db: false,
        payments: isPaystackConfigured(),
        storage: isR2Configured(),
        email: isEmailConfigured(),
        admin: Boolean(process.env.ADMIN_PASSWORD),
        time: new Date().toISOString()
    };

    if (!isDbConfigured()) {
        json(res, 503, result);
        return;
    }

    try {
        await ensureSchema();
        await query('SELECT 1 AS ok');
        result.ok = true;
        result.db = true;
        json(res, 200, result);
    } catch (err) {
        console.error('[health] Database check failed:', err.message);
        json(res, 503, result);
    }
});
