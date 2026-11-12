const { handle, json, method, readJson, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { listAdminExams, getExam, updateExamConfig } = require('../../exams');
const { normalizeId, normalizePrices, normalizeAllow } = require('../../validate');

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
    
    // Add tutorial fields to updates
    if (payload.tutorialPrice !== undefined) {
        updates.tutorialPrice = payload.tutorialPrice;
    }
    if (payload.tutorialLink !== undefined) {
        updates.tutorialLink = payload.tutorialLink;
    }
    if (payload.tutorialBenefits !== undefined) {
        updates.tutorialBenefits = payload.tutorialBenefits;
    }

    const exam = await updateExamConfig(id, updates);
    json(res, 200, { success: true, exam: exam });
});
