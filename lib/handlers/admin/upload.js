const { handle, json, method, readBinary, getClientIp, HttpError } = require('../../http');
const { ensureSchema } = require('../../schema');
const { requireAdmin } = require('../../auth');
const { uploadImage } = require('../../r2');
const { enforceRateLimit } = require('../../rate-limit');
const { RATE_LIMITS, MAX_IMAGE_BYTES, MAX_IMAGE_MB } = require('../../constants');

// The image bytes are posted to this function and forwarded to R2 from the
// server. That keeps the upload working on any bucket (no CORS policy needed)
// and stays inside Vercel's 4.5 MB request body limit.
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

    const contentType = String(req.headers['x-file-type'] || '').split(';')[0].trim()
        || String(req.headers['content-type'] || '').split(';')[0].trim();
    const fileName = String(req.headers['x-file-name'] || 'upload').slice(0, 200);

    const body = await readBinary(req, MAX_IMAGE_BYTES);

    if (!body.length) {
        throw new HttpError(400, 'No image was received. Please try again.');
    }

    const result = await uploadImage({
        body: body,
        contentType: contentType,
        fileName: fileName
    });

    json(res, 200, {
        success: true,
        publicUrl: result.publicUrl,
        key: result.key,
        size: result.size,
        maxSizeMb: MAX_IMAGE_MB
    });
});
