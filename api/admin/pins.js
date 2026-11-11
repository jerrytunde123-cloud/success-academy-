const { handle, json, method, readJson, getQuery, HttpError } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { getExam } = require('../../lib/exams');
const { listPins, createManualPin } = require('../../lib/pins');
const { normalizeId, normalizeLimit } = require('../../lib/validate');
const { normalizeDeviceId, normalizeSubjectSelection } = require('../../lib/domain');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'POST'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();

    if (req.method === 'GET') {
        const limit = normalizeLimit(getQuery(req).get('limit'), 500, 2000);
        json(res, 200, await listPins(limit));
        return;
    }

    const payload = await readJson(req, 64 * 1024);
    const examId = normalizeId(payload.examId, 'examId');
    const exam = await getExam(examId);
    if (!exam) {
        throw new HttpError(404, 'Exam not found.');
    }

    const deviceId = normalizeDeviceId(payload.deviceId);
    const subjects = normalizeSubjectSelection(exam, payload.subjects);
    const pin = await createManualPin({
        examId: examId,
        subjects: subjects,
        deviceId: deviceId,
        pin: payload.manualPin || payload.pin || null
    });

    json(res, 200, {
        success: true,
        pin: pin,
        examId: examId,
        examName: exam.name,
        subjects: subjects,
        deviceId: deviceId
    });
});
