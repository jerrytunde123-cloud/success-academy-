const crypto = require('crypto');
const { batch, execute, queryOne } = require('./db');
const { HttpError } = require('./http');
const { generatePin, isUniqueError } = require('./pins');

function newReference() {
    return 'SA_' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function parseSubjects(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
        return [];
    }
}

function parseOrder(row) {
    if (!row) {
        return null;
    }
    return {
        reference: row.reference,
        examId: row.examId,
        packageType: row.packageType,
        subjects: parseSubjects(row.subjects),
        deviceId: row.deviceId,
        email: row.email,
        amount: Number(row.amount),
        currency: row.currency || 'NGN',
        status: row.status,
        pin: row.pin,
        createdAt: row.createdAt,
        paidAt: row.paidAt || null
    };
}

async function createPendingOrder(input) {
    const subjectsJson = JSON.stringify(input.subjects);
    const createdAt = new Date().toISOString();

    for (let attempt = 0; attempt < 5; attempt++) {
        const reference = newReference();
        const pin = generatePin();

        try {
            await batch([
                {
                    sql: 'INSERT INTO orders (reference, examId, packageType, subjects, deviceId, email, amount, currency, status, pin, createdAt, paidAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
                    args: [
                        reference,
                        input.examId,
                        input.packageType,
                        subjectsJson,
                        input.deviceId,
                        input.email,
                        input.amountKobo,
                        'NGN',
                        'pending',
                        pin,
                        createdAt
                    ]
                },
                {
                    sql: 'INSERT INTO pins (pin, examId, subjects, deviceId, date, orderRef, active, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)',
                    args: [pin, input.examId, subjectsJson, input.deviceId, createdAt, reference]
                }
            ]);
            return { reference: reference, pin: pin, createdAt: createdAt };
        } catch (err) {
            if (!isUniqueError(err)) {
                throw err;
            }
        }
    }

    throw new HttpError(500, 'Could not create a unique order. Please try again.');
}

async function getOrder(reference) {
    const row = await queryOne('SELECT * FROM orders WHERE reference = ?', [reference]);
    return parseOrder(row);
}

async function markOrderPaid(reference) {
    const paidAt = new Date().toISOString();
    await batch([
        {
            sql: "UPDATE orders SET status = 'paid', paidAt = ? WHERE reference = ? AND status = 'pending'",
            args: [paidAt, reference]
        },
        {
            sql: "UPDATE pins SET active = 1 WHERE orderRef = ? AND EXISTS (SELECT 1 FROM orders WHERE reference = ? AND status IN ('paid', 'pending'))",
            args: [reference, reference]
        }
    ]);
    return paidAt;
}

async function markOrderFailed(reference) {
    await execute(
        "UPDATE orders SET status = 'failed' WHERE reference = ? AND status = 'pending'",
        [reference]
    );
}

module.exports = {
    newReference,
    parseOrder,
    createPendingOrder,
    getOrder,
    markOrderPaid,
    markOrderFailed
};
