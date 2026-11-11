const { handle, json, method, readJson, getClientIp, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { getOrder, markOrderPaid } = require('../../orders');
const { normalizeReference, normalizeDeviceId } = require('../../domain');
const { getExam } = require('../../exams');
const { isPaystackConfigured, verifyTransaction } = require('../../paystack');
const { enforceRateLimit } = require('../../rate-limit');
const { RATE_LIMITS } = require('../../constants');

async function responseForOrder(order) {
    const exam = await getExam(order.examId);
    return {
        success: true,
        pin: order.pin,
        reference: order.reference,
        examId: order.examId,
        examName: exam ? exam.name : 'Exam',
        subjects: order.subjects,
        date: order.createdAt
    };
}

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'claim:' + getClientIp(req),
        RATE_LIMITS.claim.limit,
        RATE_LIMITS.claim.windowSeconds
    );

    const payload = await readJson(req, 16 * 1024);
    const reference = normalizeReference(payload.reference);
    const deviceId = normalizeDeviceId(payload.deviceId);

    const order = await getOrder(reference);
    if (!order) {
        throw new HttpError(404, 'Payment reference not found.');
    }

    if (order.deviceId !== deviceId) {
        throw new HttpError(403, 'This payment belongs to a different device.');
    }

    if (order.status === 'paid') {
        // markOrderPaid() already activated the PIN on the first claim.
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

    await markOrderPaid(reference);
    const paidOrder = await getOrder(reference);
    if (!paidOrder) {
        throw new HttpError(500, 'The order could not be loaded after payment.');
    }

    json(res, 200, await responseForOrder(paidOrder));
});
