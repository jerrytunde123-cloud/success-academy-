const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { HttpError } = require('./http');
const { MAX_IMAGE_BYTES } = require('./constants');

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

async function createPresignedUpload(input) {
    const fileSize = Number(input.fileSize);
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
        throw new HttpError(400, 'Images must be smaller than ' + Math.round(MAX_IMAGE_BYTES / 1024 / 1024) + ' MB.');
    }

    const contentType = normalizeContentType(input.contentType, input.fileName);
    const extension = extensionFor(contentType, input.fileName);
    const date = new Date().toISOString().slice(0, 10);
    const key = 'uploads/' + date + '/' + crypto.randomUUID() + '.' + extension;

    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable'
    });

    const uploadUrl = await getSignedUrl(getR2(), command, { expiresIn: 300 });
    return {
        uploadUrl: uploadUrl,
        publicUrl: getPublicBase() + '/' + key,
        key: key,
        expiresIn: 300
    };
}

module.exports = {
    CONTENT_TYPE_EXTENSIONS,
    isR2Configured,
    getR2,
    getPublicBase,
    extensionFor,
    normalizeContentType,
    createPresignedUpload
};
