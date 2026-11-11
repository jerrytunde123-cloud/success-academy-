const { handle, json, method, readJson, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { listNews, createNews, updateNews, deleteNews } = require('../../news');
const { normalizeNewsInput, normalizeNumericId, normalizeLimit } = require('../../validate');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET', 'POST', 'PUT', 'DELETE'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();

    const queryParams = getQuery(req);

    if (req.method === 'GET') {
        const limit = normalizeLimit(queryParams.get('limit'), 100, 200);
        json(res, 200, await listNews(limit));
        return;
    }

    if (req.method === 'DELETE') {
        const id = normalizeNumericId(queryParams.get('id'), 'id');
        const deleted = await deleteNews(id);
        if (!deleted) {
            throw new HttpError(404, 'News item not found.');
        }
        json(res, 200, { success: true });
        return;
    }

    const payload = await readJson(req, 256 * 1024);
    const input = normalizeNewsInput(payload);

    if (req.method === 'POST') {
        const id = await createNews(input);
        json(res, 200, { success: true, id: id });
        return;
    }

    const id = normalizeNumericId(payload.id || queryParams.get('id'), 'id');
    const updated = await updateNews(id, input);
    if (!updated) {
        throw new HttpError(404, 'News item not found.');
    }
    json(res, 200, { success: true, id: id });
});
