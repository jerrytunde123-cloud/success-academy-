const { handle, json, method, readJson, getQuery } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { updateExamSubject, getExam } = require('../../exams');
const { normalizeId, normalizeSubjectUpdate, text } = require('../../validate');
const { deleteUnusedImages } = require('../../media');

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

    const exam = await getExam(examId);
    const currentSubject = exam && exam.subjects.find(function (subject) {
        return subject.name === subjectName;
    });
    const subject = await updateExamSubject(examId, subjectName, update);
    let warning = '';
    if (currentSubject) {
        const remaining = new Set([update.thumbnail].concat(update.qaImages));
        const removed = [currentSubject.thumbnail].concat(currentSubject.qaImages)
            .filter(function (url) { return url && !remaining.has(url); });
        warning = await deleteUnusedImages(removed);
    }
    json(res, 200, { success: true, subject: subject, warning: warning });
});
