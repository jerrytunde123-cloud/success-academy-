const crypto = require('crypto');
const { execute, queryOne } = require('./db');
const { HttpError } = require('./http');
const { isUniqueError } = require('./pins');

function parseTutorialOrder(row) {
    if (!row) {
        return null;
    }
    return {
        reference: row.reference,
        examId: String(row.examId),
        tutorialLink: row.tutorialLink || '',
        email: row.email,
        amount: Number(row.amount),
        currency: row.currency || 'NGN',
        status: row.status,
        createdAt: row.createdAt,
        paidAt: row.paidAt || null
    };
}

async function getTutorialOrder(reference) {
    return parseTutorialOrder(await queryOne(
        'SELECT * FROM tutorial_orders WHERE reference = ?',
        [reference]
    ));
}

async function createPendingTutorialOrder(input) {
    const createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
        const reference = 'TUT_' + crypto.randomBytes(8).toString('hex').toUpperCase();
        try {
            await execute(
                'INSERT INTO tutorial_orders (reference, examId, tutorialLink, email, amount, currency, status, createdAt, paidAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
                [reference, input.examId, input.tutorialLink, input.email, input.amountKobo, 'NGN', 'pending', createdAt]
            );
            return { reference: reference, createdAt: createdAt };
        } catch (err) {
            if (!isUniqueError(err)) {
                throw err;
            }
        }
    }
    throw new HttpError(500, 'Could not create a unique tutorial order. Please try again.');
}

async function markTutorialOrderFailed(reference) {
    await execute(
        "UPDATE tutorial_orders SET status = 'failed' WHERE reference = ? AND status = 'pending'",
        [reference]
    );
}

async function markTutorialOrderPaid(reference) {
    const paidAt = new Date().toISOString();
    await execute(
        "UPDATE tutorial_orders SET status = 'paid', paidAt = ? WHERE reference = ? AND status = 'pending'",
        [paidAt, reference]
    );
    const order = await getTutorialOrder(reference);
    if (!order) {
        throw new HttpError(404, 'Tutorial order not found.');
    }
    if (order.status !== 'paid') {
        throw new HttpError(409, 'This tutorial payment cannot be completed.');
    }
    return order;
}

module.exports = {
    parseTutorialOrder,
    getTutorialOrder,
    createPendingTutorialOrder,
    markTutorialOrderFailed,
    markTutorialOrderPaid
};
