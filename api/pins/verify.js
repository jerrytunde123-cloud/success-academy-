const { handle, json, method, readJson, getClientIp, HttpError } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { normalizePin, findActivePin, touchPin } = require('../../lib/pins');
const { normalizeDeviceId } = require('../../lib/domain');
const { getExam } = require('../../lib/exams');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { RATE_LIMITS } = require('../../lib/constants');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'verify:' + getClientIp(req),
        RATE_LIMITS.verify.limit,
        RATE_LIMITS.verify.windowSeconds
    );

    const payload = await readJson(req, 16 * 1024);
    const pin = normalizePin(payload.pin);
    const deviceId = normalizeDeviceId(payload.deviceId);

    const pinRow = await findActivePin(pin);
    if (!pinRow) {
        throw new HttpError(404, 'Invalid PIN.');
    }

    if (pinRow.deviceId !== deviceId) {
        throw new HttpError(403, 'This PIN was purchased on a different device.');
    }

    const exam = await getExam(pinRow.examId);
    if (!exam) {
        throw new HttpError(404, 'The exam for this PIN no longer exists.');
    }

    const purchased = new Set(pinRow.subjects);
    const subjects = exam.subjects
        .filter(function (subject) {
            return purchased.has(subject.name);
        })
        .map(function (subject) {
            return {
                name: subject.name,
                content: subject.content,
                thumbnail: subject.thumbnail,
                qaImages: subject.qaImages
            };
        });

    try {
        await touchPin(pin);
    } catch (err) {
        console.error('[verify] Could not update lastUsedAt:', err.message);
    }

    json(res, 200, {
        success: true,
        pin: pinRow.pin,
        exam: { id: exam.id, name: exam.name },
        subjects: subjects
    });
});
