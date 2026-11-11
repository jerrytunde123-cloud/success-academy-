const { handle, json, method, readJson, getClientIp, getBaseUrl, HttpError } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { getExam } = require('../lib/exams');
const { resolvePackage, normalizeDeviceId, normalizeEmail } = require('../lib/domain');
const { normalizeId } = require('../lib/validate');
const { createPendingOrder, markOrderFailed } = require('../lib/orders');
const { isPaystackConfigured, initializeTransaction } = require('../lib/paystack');
const { enforceRateLimit } = require('../lib/rate-limit');
const { RATE_LIMITS } = require('../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'checkout:' + getClientIp(req),
        RATE_LIMITS.checkout.limit,
        RATE_LIMITS.checkout.windowSeconds
    );

    if (!isPaystackConfigured()) {
        throw new HttpError(503, 'Payments are not available yet. Please contact support.');
    }

    const payload = await readJson(req, 32 * 1024);
    const examId = normalizeId(payload.examId, 'examId');
    const packageType = String(payload.packageType || '').trim();
    const deviceId = normalizeDeviceId(payload.deviceId);
    const email = normalizeEmail(payload.email);

    const exam = await getExam(examId);
    if (!exam) {
        throw new HttpError(404, 'Exam not found.');
    }

    const order = resolvePackage(exam, packageType, payload.subjects);

    const pending = await createPendingOrder({
        examId: exam.id,
        packageType: packageType,
        subjects: order.subjects,
        deviceId: deviceId,
        email: email,
        amountKobo: order.amountKobo
    });

    try {
        const transaction = await initializeTransaction({
            email: email,
            amountKobo: order.amountKobo,
            reference: pending.reference,
            callbackUrl: getBaseUrl(req) + '/',
            metadata: {
                orderReference: pending.reference,
                examId: exam.id,
                packageType: packageType
            }
        });

        if (!transaction || !transaction.authorization_url) {
            throw new HttpError(502, 'Paystack did not return a checkout URL.');
        }

        json(res, 200, {
            success: true,
            reference: pending.reference,
            authorizationUrl: transaction.authorization_url,
            accessCode: transaction.access_code || null,
            amount: order.price,
            currency: 'NGN'
        });
    } catch (err) {
        try {
            await markOrderFailed(pending.reference);
        } catch (markErr) {
            console.error('[checkout] Could not mark order as failed:', markErr.message);
        }
        throw err;
    }
});
