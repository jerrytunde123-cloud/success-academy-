const { handle, json, method, readJson, getQuery, HttpError } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { listAdminExams, getExam, updateExamConfig } = require('../../lib/exams');
const { normalizeId, normalizePrices, normalizeAllow } = require('../../lib/validate');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'PUT'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();
    const queryParams = getQuery(req);

    if (req.method === 'GET') {
        const id = queryParams.get('id');
        if (!id) {
            json(res, 200, await listAdminExams());
            return;
        }

        const exam = await getExam(normalizeId(id, 'id'));
        if (!exam) {
            throw new HttpError(404, 'Exam not found.');
        }
        json(res, 200, exam);
        return;
    }

    const payload = await readJson(req, 64 * 1024);
    const id = normalizeId(payload.id || queryParams.get('id'), 'id');
    const updates = {};

    if (payload.prices !== undefined) {
        updates.prices = normalizePrices(payload.prices);
    }
    if (payload.allow !== undefined) {
        updates.allow = normalizeAllow(payload.allow);
    }

    const exam = await updateExamConfig(id, updates);
    json(res, 200, { success: true, exam: exam });
});
