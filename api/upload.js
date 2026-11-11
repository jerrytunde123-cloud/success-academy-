const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Expects multipart/form-data. On Vercel, use a body parser or
        // have the frontend send base64 JSON instead for simplicity.
        // Fallback: frontend can POST { imageBase64, fileName } JSON.
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);

        const fileExtension = (data.fileName || 'upload').split('.').pop();
        const fileName = 'uploads/' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + fileExtension;
        const buffer = Buffer.from(data.imageBase64.split(',')[1], 'base64');

        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: data.contentType || 'image/png',
        }));

        const url = (process.env.R2_PUBLIC_URL || '') + '/' + fileName;
        res.status(200).json({ imageUrl: url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
