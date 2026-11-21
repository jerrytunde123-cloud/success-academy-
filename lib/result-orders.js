// Orders for result-checker PINs. Payment is verified by the claim handler;
// this module owns the order/pin state transitions.

const crypto = require('crypto');
const { batch, execute, query, queryOne } = require('./db');
const { HttpError } = require('./http');
const { isUniqueError } = require('./pins');
const { reservePin, releasePin } = require('./result-pins');

function newReference() {
    return 'RES_' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function normalizeResultReference(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!/^RES_[A-F0-9]{16}$/.test(value)) {
        throw new HttpError(400, 'A valid payment reference is required.');
    }
    return value;
}

function parseOrder(row) {
    if (!row) {
        return null;
    }
    return {
        reference: String(row.reference),
        productId: String(row.productId),
        pinId: row.pinId === null || row.pinId === undefined ? null : Number(row.pinId),
        pin: String(row.pin || ''),
        serial: String(row.serial || ''),
        deviceId: String(row.deviceId),
        email: String(row.email),
        amount: Number(row.amountKobo),
        currency: String(row.currency || 'NGN'),
        status: String(row.status),
        claimToken: row.claimToken || null,
        createdAt: row.createdAt,
        paidAt: row.paidAt || null,
        emailedAt: row.emailedAt || null
    };
}

async function getResultOrder(reference) {
    return parseOrder(await queryOne('SELECT * FROM result_orders WHERE reference = ?', [reference]));
}

async function listResultOrders(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const rows = await query(
        'SELECT o.*, p.name AS productName FROM result_orders o LEFT JOIN result_products p ON p.id = o.productId ORDER BY o.createdAt DESC LIMIT ?',
        [safeLimit]
    );
    return rows.map(function (row) {
        const order = parseOrder(row);
        order.productName = row.productName || null;
        return order;
    });
}

async function createPendingResultOrder(input) {
    const createdAt = new Date().toISOString();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const reference = newReference();
        let reserved = null;
        try {
            reserved = await reservePin(input.product.id, reference);
            await execute(
                'INSERT INTO result_orders (reference, productId, pinId, pin, serial, deviceId, email, amountKobo, currency, status, createdAt, paidAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'NGN\', \'pending\', ?, NULL)',
                [
                    reference,
                    input.product.id,
                    reserved.id,
                    reserved.pin,
                    reserved.serial,
                    input.deviceId,
                    input.email,
                    input.product.priceKobo,
                    createdAt
                ]
            );
            return getResultOrder(reference);
        } catch (err) {
            if (reserved) {
                try {
                    await releasePin(reserved.id, reference);
                } catch (releaseErr) {
                    console.error('[result-orders] Could not release reserved PIN:', releaseErr.message);
                }
            }
            if (!isUniqueError(err)) {
                throw err;
            }
        }
    }
    throw new HttpError(500, 'Could not create a unique order. Please try again.');
}

async function markResultOrderFailed(reference) {
    const order = await getResultOrder(reference);
    if (!order || order.status !== 'pending') {
        return;
    }
    await execute(
        "UPDATE result_orders SET status = 'failed' WHERE reference = ? AND status = 'pending'",
        [reference]
    );
    if (order.pinId !== null) {
        await releasePin(order.pinId, reference);
    }
}

async function markResultOrderPaid(reference) {
    const order = await getResultOrder(reference);
    if (!order) {
        throw new HttpError(404, 'Result order not found.');
    }
    if (order.status === 'paid') {
        return order;
    }
    if (order.status !== 'pending') {
        throw new HttpError(409, 'This order can no longer be completed.');
    }

    const paidAt = new Date().toISOString();
    const claimToken = crypto.randomBytes(16).toString('hex');
    const results = await batch([
        {
            sql: "UPDATE result_orders SET status = 'paid', paidAt = ?, claimToken = ? WHERE reference = ? AND status = 'pending'",
            args: [paidAt, claimToken, reference]
        },
        {
            sql: "UPDATE result_pins SET status = 'sold', email = ?, deviceId = ?, soldAt = ?, reservedAt = NULL WHERE id = ? AND orderRef = ? AND status IN ('reserved', 'available')",
            args: [order.email, order.deviceId, paidAt, order.pinId, reference]
        }
    ]);

    if (Number(results[0].rowsAffected || 0) === 0 || Number(results[1].rowsAffected || 0) === 0) {
        throw new HttpError(409, 'This order was updated by another request. Please refresh and try again.');
    }
    const paidOrder = await getResultOrder(reference);
    if (!paidOrder) {
        throw new HttpError(500, 'The order could not be loaded after payment.');
    }
    return paidOrder;
}

async function findByClaimToken(reference, token) {
    if (!token || !/^[a-f0-9]{32}$/i.test(String(token))) {
        return null;
    }
    const order = await getResultOrder(reference);
    if (!order || order.status !== 'paid' || !order.claimToken) {
        return null;
    }
    const a = Buffer.from(order.claimToken, 'hex');
    const b = Buffer.from(String(token), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? order : null;
}

async function recordEmailed(reference, token) {
    const order = await findByClaimToken(reference, token);
    if (!order) {
        throw new HttpError(404, 'Order not found.');
    }
    await execute(
        'UPDATE result_orders SET emailedAt = ? WHERE reference = ? AND emailedAt IS NULL',
        [new Date().toISOString(), reference]
    );
}

async function deleteResultOrder(reference) {
    const order = await getResultOrder(reference);
    if (!order) {
        return false;
    }
    if (order.status === 'pending') {
        throw new HttpError(409, 'Pending orders cannot be deleted while payment may still complete.');
    }
    await execute('DELETE FROM result_orders WHERE reference = ?', [reference]);
    return true;
}

module.exports = {
    newReference,
    normalizeResultReference,
    parseOrder,
    getResultOrder,
    listResultOrders,
    createPendingResultOrder,
    markResultOrderFailed,
    markResultOrderPaid,
    findByClaimToken,
    recordEmailed,
    deleteResultOrder
};
