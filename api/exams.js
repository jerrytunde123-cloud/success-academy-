const { handle, json, method } = require('../lib/http');
const { ensureSchema } = require('../lib/schema');
const { listPublicExams } = require('../lib/exams');

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    await ensureSchema();
    const exams = await listPublicExams();
    json(res, 200, exams);
});
