const { HttpError } = require('./http');
const {
    PACKAGE_TYPES,
    MAX_QA_IMAGES,
    MAX_SUBJECT_CONTENT_LENGTH,
    MAX_NEWS_IMAGES
} = require('./constants');
const { normalizeEmail } = require('./domain');

const MAX_PRICE_NAIRA = 10000000;
const MAX_IMAGE_URL_LENGTH = 2048;

function text(value, field, options) {
    const opts = options || {};
    if (value === undefined || value === null) {
        if (opts.required) {
            throw new HttpError(400, field + ' is required.');
        }
        return opts.defaultValue !== undefined ? opts.defaultValue : '';
    }
    if (typeof value !== 'string') {
        throw new HttpError(400, field + ' must be text.');
    }
    const result = opts.trim === false ? value : value.trim();
    if (opts.required && result.length === 0) {
        throw new HttpError(400, field + ' is required.');
    }
    if (opts.min !== undefined && result.length < opts.min) {
        throw new HttpError(400, field + ' is too short.');
    }
    if (opts.max !== undefined && result.length > opts.max) {
        throw new HttpError(400, field + ' is too long (max ' + opts.max + ' characters).');
    }
    return result;
}

function normalizeId(value, field) {
    const result = text(value, field, { required: true, max: 64 });
    if (!/^[A-Za-z0-9_-]+$/.test(result)) {
        throw new HttpError(400, field + ' is invalid.');
    }
    return result;
}

function normalizeNumericId(value, field) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        throw new HttpError(400, field + ' is invalid.');
    }
    return number;
}

function normalizeImageUrl(value, field, required) {
    const result = text(value, field, { required: Boolean(required), max: MAX_IMAGE_URL_LENGTH });
    if (!result) {
        return '';
    }
    if (result.indexOf('assets/') === 0 || result.indexOf('/assets/') === 0) {
        return result;
    }
    if (!/^https?:\/\//i.test(result)) {
        throw new HttpError(400, field + ' must be an http(s) URL.');
    }
    return result;
}

function normalizePrices(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpError(400, 'prices must be an object.');
    }
    const result = {};
    let count = 0;
    for (const key of PACKAGE_TYPES) {
        if (input[key] === undefined) {
            continue;
        }
        const number = Number(input[key]);
        if (!Number.isInteger(number) || number < 0 || number > MAX_PRICE_NAIRA) {
            throw new HttpError(400, 'Price for ' + key + ' must be a whole number between 0 and ' + MAX_PRICE_NAIRA + '.');
        }
        result[key] = number;
        count++;
    }
    if (count === 0) {
        throw new HttpError(400, 'At least one price is required.');
    }
    return result;
}

function normalizeAllow(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpError(400, 'allow must be an object.');
    }
    const result = {};
    let count = 0;
    for (const key of PACKAGE_TYPES) {
        if (input[key] === undefined) {
            continue;
        }
        if (typeof input[key] !== 'boolean') {
            throw new HttpError(400, 'allow.' + key + ' must be true or false.');
        }
        result[key] = input[key];
        count++;
    }
    if (count === 0) {
        throw new HttpError(400, 'At least one package setting is required.');
    }
    return result;
}

function normalizeTutorialPrice(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > MAX_PRICE_NAIRA) {
        throw new HttpError(400, 'Tutorial price must be a whole number between 0 and ' + MAX_PRICE_NAIRA + '.');
    }
    return number;
}

function normalizeTutorialLink(value) {
    const result = text(value, 'tutorialLink', { max: 2048, defaultValue: '' });
    if (!result) {
        return '';
    }
    let url;
    try {
        url = new URL(result);
    } catch (_err) {
        throw new HttpError(400, 'tutorialLink must be a valid HTTPS URL.');
    }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        throw new HttpError(400, 'tutorialLink must be a valid HTTPS URL.');
    }
    return url.toString();
}

function normalizeQaImages(input) {
    if (input === undefined || input === null) {
        return [];
    }
    if (!Array.isArray(input)) {
        throw new HttpError(400, 'qaImages must be an array.');
    }
    if (input.length > MAX_QA_IMAGES) {
        throw new HttpError(400, 'A subject can have at most ' + MAX_QA_IMAGES + ' Q&A images.');
    }
    const seen = new Set();
    const result = [];
    for (let index = 0; index < input.length; index++) {
        const url = normalizeImageUrl(input[index], 'qaImages[' + index + ']', true);
        if (!seen.has(url)) {
            seen.add(url);
            result.push(url);
        }
    }
    return result;
}

function normalizeSubjectUpdate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'Subject data must be an object.');
    }
    return {
        content: text(payload.content, 'content', {
            max: MAX_SUBJECT_CONTENT_LENGTH,
            defaultValue: ''
        }),
        thumbnail: normalizeImageUrl(payload.thumbnail, 'thumbnail', false),
        qaImages: normalizeQaImages(payload.qaImages)
    };
}

function normalizeNewsInput(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'News data must be an object.');
    }
    const images = payload.images === undefined || payload.images === null ? [] : payload.images;
    if (!Array.isArray(images) || images.length > MAX_NEWS_IMAGES) {
        throw new HttpError(400, 'News can have at most ' + MAX_NEWS_IMAGES + ' images.');
    }
    return {
        title: text(payload.title, 'title', { required: true, max: 200 }),
        content: text(payload.content, 'content', { required: true, max: 50000 }),
        images: images.map(function (image, index) {
            return normalizeImageUrl(image, 'images[' + index + ']', true);
        })
    };
}

function normalizeEnquiryInput(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'Enquiry data must be an object.');
    }

    const honeypot = text(payload.website, 'website', { max: 200, defaultValue: '' });
    return {
        honeypot: honeypot,
        name: text(payload.name, 'name', { required: true, max: 100 }),
        email: normalizeEmail(payload.email),
        phone: text(payload.phone, 'phone', { required: true, max: 30 }),
        exam: text(payload.exam, 'exam', { max: 100, defaultValue: '' }),
        message: text(payload.message, 'message', { required: true, max: 5000 })
    };
}

function normalizeReplyInput(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'Reply data must be an object.');
    }
    return {
        id: normalizeNumericId(payload.id, 'id'),
        message: text(payload.message, 'message', { required: true, max: 5000 })
    };
}

function normalizeLimit(value, fallback, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        return fallback;
    }
    return Math.min(number, max);
}

module.exports = {
    text,
    normalizeId,
    normalizeNumericId,
    normalizeImageUrl,
    normalizePrices,
    normalizeAllow,
    normalizeTutorialPrice,
    normalizeTutorialLink,
    normalizeQaImages,
    normalizeSubjectUpdate,
    normalizeNewsInput,
    normalizeEnquiryInput,
    normalizeReplyInput,
    normalizeLimit
};
