const { handle, json, method, readJson, getQuery } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { updateExamSubject } = require('../../lib/exams');
const { normalizeId, normalizeSubjectUpdate, text } = require('../../lib/validate');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['PUT'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();

    const queryParams = getQuery(req);
    const payload = await readJson(req, 1024 * 1024);
    const examId = normalizeId(payload.examId || queryParams.get('examId'), 'examId');
    const subjectName = text(payload.name || queryParams.get('name'), 'name', {
        required: true,
        max: 120
    });
    const update = normalizeSubjectUpdate(payload);

    const subject = await updateExamSubject(examId, subjectName, update);
    json(res, 200, { success: true, subject: subject });
});
