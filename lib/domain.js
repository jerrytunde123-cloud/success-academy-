// Pure business rules. Nothing in this file talks to a database or the network.

const { HttpError } = require('./http');
const {
    PACKAGE_TYPES,
    JAMB_LIKE_PATTERN,
    SUBJECT_LIMIT_JAMB_LIKE,
    SUBJECT_LIMIT_DEFAULT
} = require('./constants');

function getSubjectLimit(examName) {
    return JAMB_LIKE_PATTERN.test(String(examName || ''))
        ? SUBJECT_LIMIT_JAMB_LIKE
        : SUBJECT_LIMIT_DEFAULT;
}

function normalizeDeviceId(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!/^DEV-[A-Z0-9_-]{4,60}$/.test(value)) {
        throw new HttpError(400, 'A valid device ID is required (example: DEV-ABC123456).');
    }
    return value;
}

function normalizeEmail(raw) {
    const value = String(raw || '').trim();
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        throw new HttpError(400, 'A valid email address is required.');
    }
    return value;
}

function normalizeReference(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!/^SA_[A-F0-9]{16,64}$/.test(value)) {
        throw new HttpError(400, 'A valid payment reference is required.');
    }
    return value;
}

function uniqueSubjectNames(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const name = String(value || '').trim();
        if (!name || seen.has(name)) {
            continue;
        }
        seen.add(name);
        result.push(name);
    }
    return result;
}

function assertSubjectsExist(exam, subjects) {
    const available = new Set(exam.subjects.map(function (subject) {
        return subject.name;
    }));
    const unknown = subjects.filter(function (name) {
        return !available.has(name);
    });
    if (unknown.length > 0) {
        throw new HttpError(400, 'Unknown subject(s): ' + unknown.slice(0, 3).join(', '));
    }
}

function normalizeSubjectSelection(exam, selected) {
    if (!Array.isArray(selected)) {
        throw new HttpError(400, 'Subjects must be an array.');
    }
    const subjects = uniqueSubjectNames(selected);
    if (subjects.length === 0) {
        throw new HttpError(400, 'Select at least one subject.');
    }
    assertSubjectsExist(exam, subjects);
    return subjects;
}

function resolvePackage(exam, packageType, selected) {
    if (PACKAGE_TYPES.indexOf(packageType) === -1) {
        throw new HttpError(400, 'Invalid package type.');
    }

    if (!exam || !exam.allow || exam.allow[packageType] !== true) {
        throw new HttpError(403, 'This package is not available for the selected exam.');
    }

    const availableSubjects = exam.subjects.map(function (subject) {
        return subject.name;
    });
    if (availableSubjects.length === 0) {
        throw new HttpError(409, 'This exam does not have any subjects yet.');
    }

    let subjects;
    if (packageType === 'all_subjects') {
        subjects = availableSubjects;
    } else {
        subjects = normalizeSubjectSelection(exam, selected);
    }

    if (packageType === 'per_subject' && subjects.length !== 1) {
        throw new HttpError(400, 'The per-subject package covers exactly one subject.');
    }

    if (packageType === 'per_dept') {
        const maxSubjects = getSubjectLimit(exam.name);
        if (subjects.length > maxSubjects) {
            throw new HttpError(400, 'This exam allows at most ' + maxSubjects + ' subjects per department.');
        }
    }

    const price = Number(exam.prices && exam.prices[packageType]);
    if (!Number.isInteger(price) || price <= 0) {
        throw new HttpError(409, 'The price for this package has not been configured.');
    }

    const amountKobo = price * 100;
    if (!Number.isSafeInteger(amountKobo)) {
        throw new HttpError(500, 'The configured price is too large.');
    }

    return {
        subjects: subjects,
        price: price,
        amountKobo: amountKobo
    };
}

module.exports = {
    getSubjectLimit,
    normalizeDeviceId,
    normalizeEmail,
    normalizeReference,
    uniqueSubjectNames,
    assertSubjectsExist,
    normalizeSubjectSelection,
    resolvePackage
};
