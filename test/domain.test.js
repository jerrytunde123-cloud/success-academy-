const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getSubjectLimit,
    normalizeDeviceId,
    normalizeEmail,
    normalizeReference,
    resolvePackage
} = require('../lib/domain');

function makeExam(name) {
    return {
        id: '1',
        name: name,
        prices: { per_subject: 1000, per_dept: 5000, all_subjects: 8000 },
        allow: { per_subject: true, per_dept: true, all_subjects: true },
        subjects: [
            { name: 'English Language' },
            { name: 'Mathematics' },
            { name: 'Biology' },
            { name: 'Chemistry' },
            { name: 'Physics' },
            { name: 'Economics' },
            { name: 'Government' }
        ]
    };
}

function isHttpError(status) {
    return function (err) {
        return err && err.status === status;
    };
}

test('subject limits follow the exam type', function () {
    assert.equal(getSubjectLimit('JAMB'), 4);
    assert.equal(getSubjectLimit('POST UTME'), 4);
    assert.equal(getSubjectLimit('WAEC'), 9);
});

test('device IDs, emails and references are normalized and validated', function () {
    assert.equal(normalizeDeviceId(' dev-abc12345 '), 'DEV-ABC12345');
    assert.throws(function () { normalizeDeviceId('abc'); }, isHttpError(400));
    assert.equal(normalizeEmail(' Student@Example.com '), 'Student@Example.com');
    assert.throws(function () { normalizeEmail('not-an-email'); }, isHttpError(400));
    assert.equal(normalizeReference('sa_0123456789abcdef'), 'SA_0123456789ABCDEF');
    assert.throws(function () { normalizeReference('SA_123'); }, isHttpError(400));
});

test('per-subject packages require exactly one known subject', function () {
    const exam = makeExam('WAEC');
    const resolved = resolvePackage(exam, 'per_subject', ['English Language']);
    assert.deepEqual(resolved.subjects, ['English Language']);
    assert.equal(resolved.price, 1000);
    assert.equal(resolved.amountKobo, 100000);

    assert.throws(function () {
        resolvePackage(exam, 'per_subject', ['English Language', 'Mathematics']);
    }, isHttpError(400));

    assert.throws(function () {
        resolvePackage(exam, 'per_subject', ['Further Mathematics']);
    }, isHttpError(400));
});

test('per-department packages enforce the subject limit', function () {
    const waec = makeExam('WAEC');
    const waecSubjects = waec.subjects.slice(0, 7).map(function (subject) { return subject.name; });
    const resolved = resolvePackage(waec, 'per_dept', waecSubjects);
    assert.equal(resolved.subjects.length, 7);
    assert.equal(resolved.price, 5000);

    const jamb = makeExam('JAMB');
    const five = jamb.subjects.slice(0, 5).map(function (subject) { return subject.name; });
    assert.throws(function () {
        resolvePackage(jamb, 'per_dept', five);
    }, isHttpError(400));
});

test('all-subject packages include every subject on the exam', function () {
    const exam = makeExam('NECO');
    const resolved = resolvePackage(exam, 'all_subjects', []);
    assert.equal(resolved.subjects.length, exam.subjects.length);
    assert.equal(resolved.amountKobo, 800000);
});

test('disabled packages and unconfigured prices are rejected', function () {
    const exam = makeExam('WAEC');
    exam.allow.per_dept = false;
    assert.throws(function () {
        resolvePackage(exam, 'per_dept', ['English Language']);
    }, isHttpError(403));

    exam.prices.per_subject = 0;
    assert.throws(function () {
        resolvePackage(exam, 'per_subject', ['English Language']);
    }, isHttpError(409));
});
