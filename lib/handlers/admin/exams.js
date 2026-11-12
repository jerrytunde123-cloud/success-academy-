const { handle, json, method, readJson, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { listAdminExams, getExam, updateExamConfig } = require('../../exams');
const {
    normalizeId,
    normalizePrices,
    normalizeAllow,
    normalizeTutorialPrice,
    normalizeTutorialLink,
    text
} = require('../../validate');

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
        updates.tutorialPrice = normalizeTutorialPrice(payload.tutorialPrice);
    }
    if (payload.tutorialLink !== undefined) {
        updates.tutorialLink = normalizeTutorialLink(payload.tutorialLink);
    }
    if (payload.tutorialBenefits !== undefined) {
        updates.tutorialBenefits = text(payload.tutorialBenefits, 'tutorialBenefits', { max: 5000 });
    }

    const hasTutorialUpdates = payload.tutorialPrice !== undefined ||
        payload.tutorialLink !== undefined ||
        payload.tutorialBenefits !== undefined;
    if (hasTutorialUpdates) {
        const currentExam = await getExam(id);
        if (!currentExam) {
            throw new HttpError(404, 'Exam not found.');
        }
        const tutorialPrice = updates.tutorialPrice !== undefined
            ? updates.tutorialPrice
            : currentExam.tutorialPrice;
        const tutorialLink = updates.tutorialLink !== undefined
            ? updates.tutorialLink
            : currentExam.tutorialLink;
        if (tutorialPrice > 0 && !tutorialLink) {
            throw new HttpError(400, 'A secure tutorial class link is required when the tutorial price is greater than zero.');
        }
    }

    const exam = await updateExamConfig(id, updates);
    json(res, 200, { success: true, exam: exam });
});
