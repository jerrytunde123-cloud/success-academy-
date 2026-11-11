const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
        json(res, 500, { error: 'R2 not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in Vercel.' });
        return;
    }

    const s3 = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });

    let parsed;
    try {
        parsed = await parseBody(req);
    } catch (e) {
        json(res, 400, { error: e.message });
        return;
    }

    console.error('[upload] Received body:', JSON.stringify({ hasImageBase64: !!parsed.imageBase64, hasFileName: !!parsed.fileName, contentType: parsed.contentType, fileName: parsed.fileName }));

    const { imageBase64, fileName, contentType } = parsed;

    if (!imageBase64 || !fileName) {
        json(res, 400, { error: 'imageBase64 and fileName are required', received: { hasImageBase64: !!parsed.imageBase64, hasFileName: !!parsed.fileName } });
        return;
    }

    try {
        const fileExtension = fileName.split('.').pop();
        const safeFileName = 'uploads/' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + fileExtension;
        const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');

        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: safeFileName,
            Body: buffer,
            ContentType: contentType || 'image/png',
        }));

        const url = (process.env.R2_PUBLIC_URL || '') + '/' + safeFileName;
        console.error('[upload] Uploaded:', url);
        json(res, 200, { imageUrl: url });
    } catch (err) {
        console.error('[upload] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
