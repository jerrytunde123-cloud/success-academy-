const { handle, json, method, readJson, getQuery, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { listNews, getNewsItem, createNews, updateNews, deleteNews } = require('../../news');
const { normalizeNewsInput, normalizeNumericId, normalizeLimit } = require('../../validate');
const { deleteUnusedImages } = require('../../media');

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
        const existing = await getNewsItem(id);
        const deleted = await deleteNews(id);
        if (!deleted) {
            throw new HttpError(404, 'News item not found.');
        }
        const warning = await deleteUnusedImages(existing ? existing.images : []);
        json(res, 200, { success: true, warning: warning });
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
    const existing = await getNewsItem(id);
    const updated = await updateNews(id, input);
    if (!updated) {
        throw new HttpError(404, 'News item not found.');
    }
    let warning = '';
    if (existing) {
        const remaining = new Set(input.images);
        warning = await deleteUnusedImages(existing.images.filter(function (url) {
            return !remaining.has(url);
        }));
    }
    json(res, 200, { success: true, id: id, warning: warning });
});
