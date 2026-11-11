const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

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

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    console.log('[upload]', req.method, req.url);
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const { imageBase64, fileName, contentType } = await parseBody(req);
        console.log('[upload] fileName:', fileName, 'hasBase64:', !!imageBase64);

        if (!imageBase64 || !fileName) {
            json(res, 400, { error: 'imageBase64 and fileName are required' });
            return;
        }

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
        console.log('[upload] uploaded:', url);
        json(res, 200, { imageUrl: url });
    } catch (err) {
        console.error('[upload] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
