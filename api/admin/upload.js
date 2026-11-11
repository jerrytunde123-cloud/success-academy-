const { handle, json, method, readJson, getClientIp, HttpError } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { createPresignedUpload } = require('../../lib/r2');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { RATE_LIMITS } = require('../../lib/constants');

const MAX_FILES = 10;

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['POST'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();
    await enforceRateLimit(
        'upload:' + getClientIp(req),
        RATE_LIMITS.upload.limit,
        RATE_LIMITS.upload.windowSeconds
    );

    const payload = await readJson(req, 32 * 1024);
    const files = Array.isArray(payload.files) ? payload.files : [payload];

    if (files.length === 0 || files.length > MAX_FILES) {
        throw new HttpError(400, 'Upload between 1 and ' + MAX_FILES + ' images at a time.');
    }

    const uploads = [];
    for (const file of files) {
        uploads.push(await createPresignedUpload({
            fileName: file.fileName || file.name,
            contentType: file.contentType || file.type,
            fileSize: file.fileSize || file.size
        }));
    }

    const result = { success: true, uploads: uploads };
    if (uploads.length === 1) {
        result.uploadUrl = uploads[0].uploadUrl;
        result.publicUrl = uploads[0].publicUrl;
        result.key = uploads[0].key;
        result.expiresIn = uploads[0].expiresIn;
    }

    json(res, 200, result);
});
