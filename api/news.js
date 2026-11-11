const { handle, json, method } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { listNews } = require('../lib/news');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    await ensureSchema();
    const news = await listNews(100);
    json(res, 200, news);
});
