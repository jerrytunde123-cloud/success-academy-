const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { HttpError } = require('./http');
const { MAX_IMAGE_BYTES, MAX_IMAGE_MB } = require('./constants');

const CONTENT_TYPE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

let s3Client = null;

function isR2Configured() {
    return Boolean(
        process.env.R2_ENDPOINT &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME &&
        process.env.R2_PUBLIC_URL
    );
}

function getR2() {
    if (s3Client) {
        return s3Client;
    }
    if (!isR2Configured()) {
        throw new HttpError(503, 'Image storage is not configured. Set the R2 environment variables in Vercel.');
    }

    s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
    });
    return s3Client;
}

function getPublicBase() {
    const value = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(value)) {
        throw new HttpError(503, 'R2_PUBLIC_URL must be a public http(s) URL.');
    }
    return value;
}

function extensionFor(contentType, fileName) {
    const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (CONTENT_TYPE_EXTENSIONS[normalized]) {
        return CONTENT_TYPE_EXTENSIONS[normalized];
    }

    const name = String(fileName || '').toLowerCase();
    const match = name.match(/\.(jpe?g|png|webp|gif)$/);
    if (match) {
        return match[1] === 'jpeg' ? 'jpg' : match[1];
    }

    throw new HttpError(400, 'Only JPG, PNG, WebP and GIF images are allowed.');
}

function normalizeContentType(contentType, fileName) {
    const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (CONTENT_TYPE_EXTENSIONS[normalized]) {
        return normalized;
    }
    const extension = extensionFor(normalized, fileName);
    const found = Object.keys(CONTENT_TYPE_EXTENSIONS).find(function (key) {
        return CONTENT_TYPE_EXTENSIONS[key] === extension;
    });
    return found || 'image/jpeg';
}

async function uploadImage(input) {
    const body = input.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(400, 'No image was received. Please try again.');
    }

    if (body.length > MAX_IMAGE_BYTES) {
        throw new HttpError(413, 'Images must be smaller than ' + MAX_IMAGE_MB + ' MB.');
    }

    const contentType = normalizeContentType(input.contentType, input.fileName);
    const extension = extensionFor(contentType, input.fileName);
    const date = new Date().toISOString().slice(0, 10);
    const key = 'uploads/' + date + '/' + crypto.randomUUID() + '.' + extension;

    await getR2().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable'
    }));

    return {
        publicUrl: getPublicBase() + '/' + key,
        key: key,
        size: body.length
    };
}

async function deleteImage(publicUrl) {
    const configuredBase = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (!configuredBase) {
        return false;
    }
    const base = getPublicBase();
    const prefix = base + '/';
    if (typeof publicUrl !== 'string' || publicUrl.indexOf(prefix) !== 0) {
        return false;
    }

    let key;
    try {
        key = decodeURIComponent(publicUrl.slice(prefix.length));
    } catch (_err) {
        return false;
    }
    if (!key.startsWith('uploads/') || key.split('/').some(function (part) {
        return !part || part === '.' || part === '..';
    })) {
        return false;
    }

    await getR2().send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
    }));
    return true;
}

module.exports = {
    CONTENT_TYPE_EXTENSIONS,
    isR2Configured,
    getR2,
    getPublicBase,
    extensionFor,
    normalizeContentType,
    uploadImage,
    deleteImage,
    __setTestClient: function (client) {
        s3Client = client;
    }
};
