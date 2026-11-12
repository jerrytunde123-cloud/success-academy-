const {
    handle,
    json,
    method,
    readJson,
    getQuery,
    getClientIp,
    getBaseUrl,
    assertSameOrigin,
    HttpError
} = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { getExam } = require('../lib/exams');
const { normalizeId } = require('../lib/validate');
const { normalizeEmail } = require('../lib/domain');
const {
    getTutorialOrder,
    createPendingTutorialOrder,
    markTutorialOrderFailed,
    markTutorialOrderPaid
} = require('../lib/tutorial-orders');
const { isPaystackConfigured, initializeTransaction, verifyTransaction } = require('../lib/paystack');
const { enforceRateLimit } = require('../lib/rate-limit');
const { RATE_LIMITS } = require('../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'POST'])) {
        return;
    }

    await ensureSchema();

    if (req.method === 'GET') {
        const examId = normalizeId(getQuery(req).get('examId'), 'examId');
        const exam = await getExam(examId);
        if (!exam) {
            throw new HttpError(404, 'Exam not found.');
        }
        json(res, 200, {
            id: exam.id,
            name: exam.name,
            tutorialPrice: exam.tutorialPrice,
            tutorialBenefits: exam.tutorialBenefits
        });
        return;
    }

    assertSameOrigin(req);
    await enforceRateLimit(
        'tutorial:' + getClientIp(req),
        RATE_LIMITS.checkout.limit,
        RATE_LIMITS.checkout.windowSeconds
    );

    const payload = await readJson(req, 16 * 1024);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'Tutorial request must be an object.');
    }
    const action = payload.action || 'verify';

    if (action === 'initialize') {
        const examId = normalizeId(payload.examId, 'examId');
        if (!isPaystackConfigured()) {
            throw new HttpError(503, 'Payments are not available yet. Please contact support.');
        }
        const email = normalizeEmail(payload.email);
        const exam = await getExam(examId);
        if (!exam) {
            throw new HttpError(404, 'Exam not found.');
        }
        if (!Number.isInteger(exam.tutorialPrice) || exam.tutorialPrice < 1 || !exam.tutorialLink) {
            throw new HttpError(409, 'Tutorial enrollment is not currently available for this exam.');
        }

        const amountKobo = exam.tutorialPrice * 100;
        const pending = await createPendingTutorialOrder({
            examId: exam.id,
            tutorialLink: exam.tutorialLink,
            email: email,
            amountKobo: amountKobo
        });
        try {
            const transaction = await initializeTransaction({
                email: email,
                amountKobo: amountKobo,
                reference: pending.reference,
                callbackUrl: getBaseUrl(req) + '/',
                metadata: {
                    tutorialReference: pending.reference,
                    examId: exam.id,
                    purchaseType: 'tutorial'
                }
            });
            if (!transaction || !transaction.access_code) {
                throw new HttpError(502, 'Paystack did not return a checkout access code.');
            }
            json(res, 200, {
                success: true,
                reference: pending.reference,
                accessCode: transaction.access_code,
                amount: exam.tutorialPrice,
                currency: 'NGN'
            });
        } catch (err) {
            try {
                await markTutorialOrderFailed(pending.reference);
            } catch (markErr) {
                console.error('[tutorials] Could not mark order as failed:', markErr.message);
            }
            throw err;
        }
        return;
    }

    if (action !== 'verify') {
        throw new HttpError(400, 'Tutorial action is invalid.');
    }
    const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
    if (!/^TUT_[A-F0-9]{16}$/.test(reference)) {
        throw new HttpError(400, 'Tutorial payment reference is invalid.');
    }

    const order = await getTutorialOrder(reference);
    if (!order || (payload.examId !== undefined && order.examId !== normalizeId(payload.examId, 'examId'))) {
        throw new HttpError(404, 'Tutorial payment not found.');
    }
    const exam = await getExam(order.examId);
    const tutorialLink = order.tutorialLink || (exam && exam.tutorialLink);
    if (!tutorialLink) {
        throw new HttpError(404, 'Tutorial class is no longer available.');
    }

    const payment = await verifyTransaction(reference);
    if (!payment || payment.status !== 'success' || payment.reference !== reference ||
        Number(payment.amount) !== order.amount || payment.currency !== order.currency) {
        throw new HttpError(400, 'Payment could not be verified for this tutorial order.');
    }

    await markTutorialOrderPaid(reference);
    json(res, 200, {
        success: true,
        examId: exam ? exam.id : order.examId,
        examName: exam ? exam.name : order.examId,
        link: tutorialLink
    });
});
