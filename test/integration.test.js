const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    createSqliteAdapter,
    createReq,
    createRes,
    jsonResponse,
    extractCookie
} = require('./helpers');

process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_integration';
process.env.R2_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'success-academy-test';
process.env.R2_PUBLIC_URL = 'https://cdn.example.com';

const db = require('../lib/db');
const { ensureSchema, __resetSchemaForTests } = require('../lib/schema');
const { updateExamSubject, getExam } = require('../lib/exams');
const { getOrder } = require('../lib/orders');

const adapter = createSqliteAdapter();
db.__setTestDb(adapter);
__resetSchemaForTests();

const examsApi = require('../api/exams');
const checkoutApi = require('../api/checkout');
const claimApi = require('../lib/handlers/pins/claim');
const verifyApi = require('../lib/handlers/pins/verify');
const enquiriesApi = require('../api/enquiries');

const adminLoginApi = require('../lib/handlers/admin/login');
const adminLogoutApi = require('../lib/handlers/admin/logout');
const adminSessionApi = require('../lib/handlers/admin/session');
const adminStatsApi = require('../lib/handlers/admin/stats');
const adminExamsApi = require('../lib/handlers/admin/exams');
const adminSubjectsApi = require('../lib/handlers/admin/subjects');
const adminPinsApi = require('../lib/handlers/admin/pins');
const adminNewsApi = require('../lib/handlers/admin/news');
const adminEnquiriesApi = require('../lib/handlers/admin/enquiries');
const adminUploadApi = require('../lib/handlers/admin/upload');

let verifyAmount = 100000;
let verifyCurrency = 'NGN';
let verifyStatus = 'success';

const originalFetch = global.fetch;
global.fetch = async function (url, options) {
    const value = String(url);

    if (value.indexOf('/transaction/initialize') !== -1) {
        const body = options && options.body ? JSON.parse(options.body) : {};
        return jsonResponse({
            status: true,
            message: 'Authorization URL created',
            data: {
                authorization_url: 'https://checkout.paystack.com/test',
                access_code: 'test_access_code',
                reference: body.reference
            }
        });
    }

    if (value.indexOf('/transaction/verify/') !== -1) {
        const reference = decodeURIComponent(value.split('/transaction/verify/')[1]);
        return jsonResponse({
            status: true,
            message: 'Verification successful',
            data: {
                status: verifyStatus,
                reference: reference,
                amount: verifyAmount,
                currency: verifyCurrency
            }
        });
    }

    throw new Error('Unexpected fetch call in test: ' + value);
};

after(function () {
    global.fetch = originalFetch;
    adapter.close();
});

async function call(handler, options) {
    const res = createRes();
    await handler(createReq(options), res);
    return res;
}

function postOptions(body, headers) {
    return {
        method: 'POST',
        headers: Object.assign({
            host: 'localhost:3000',
            'x-forwarded-proto': 'http'
        }, headers || {}),
        body: body
    };
}

test('checkout, claim, verify and admin flows work end to end', async function (t) {
    await ensureSchema();

    await updateExamSubject('1', 'English Language', {
        content: 'SECRET ANSWER CONTENT',
        thumbnail: 'https://cdn.example.com/thumb.png',
        qaImages: ['https://cdn.example.com/qa-1.png']
    });

    let reference = null;
    let pin = null;
    const deviceId = 'DEV-INTEGRATION1';
    let adminCookie = '';

    await t.test('public exams do not expose answer content', async function () {
        const res = await call(examsApi, { url: '/api/exams' });
        assert.equal(res.statusCode, 200);
        assert.equal(Array.isArray(res.body), true);
        assert.equal(res.body.length, 9);

        const waec = res.body.find(function (exam) { return exam.id === '1'; });
        assert.equal(waec.name, 'WAEC');
        const english = waec.subjects.find(function (subject) { return subject.name === 'English Language'; });
        assert.deepEqual(Object.keys(english).sort(), ['name', 'thumbnail']);
        assert.equal(Object.prototype.hasOwnProperty.call(english, 'content'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(english, 'qaImages'), false);
    });

    await t.test('checkout creates a pending order and a locked PIN', async function () {
        const res = await call(checkoutApi, postOptions({
            examId: '1',
            packageType: 'per_subject',
            subjects: ['English Language'],
            email: 'student@example.com',
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.0.1' }));

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.match(res.body.reference, /^SA_[A-F0-9]{16}$/);
        assert.equal(res.body.authorizationUrl, 'https://checkout.paystack.com/test');
        assert.equal(res.body.amount, 1000);

        reference = res.body.reference;
        const order = await getOrder(reference);
        assert.equal(order.status, 'pending');
        assert.equal(order.amount, 100000);
        assert.equal(order.currency, 'NGN');

        const lockedPin = await db.queryOne('SELECT * FROM pins WHERE orderRef = ?', [reference]);
        assert.equal(Number(lockedPin.active), 0);
        assert.match(lockedPin.pin, /^[A-Z0-9]{6}$/);
        pin = lockedPin.pin;
    });

    await t.test('a payment cannot be claimed from another device', async function () {
        const res = await call(claimApi, postOptions({
            reference: reference,
            deviceId: 'DEV-WRONGDEVICE'
        }, { 'x-forwarded-for': '10.2.0.2' }));

        assert.equal(res.statusCode, 403);
        assert.match(res.body.error, /different device/i);
    });

    await t.test('a mismatched payment amount does not unlock the PIN', async function () {
        verifyAmount = 1;
        const res = await call(claimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.0.3' }));

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /amount/i);

        const order = await getOrder(reference);
        assert.equal(order.status, 'pending');
        verifyAmount = 100000;
    });

    await t.test('a verified payment issues and activates the PIN', async function () {
        const res = await call(claimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.0.4' }));

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.pin, pin);
        assert.equal(res.body.examName, 'WAEC');
        assert.deepEqual(res.body.subjects, ['English Language']);

        const order = await getOrder(reference);
        assert.equal(order.status, 'paid');
        assert.notEqual(order.paidAt, null);

        const activePin = await db.queryOne('SELECT * FROM pins WHERE pin = ?', [pin]);
        assert.equal(Number(activePin.active), 1);
    });

    await t.test('claiming the same payment again is idempotent', async function () {
        const first = await call(claimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.0.5' }));

        const second = await call(claimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.0.6' }));

        assert.equal(first.statusCode, 200);
        assert.equal(second.statusCode, 200);
        assert.equal(first.body.pin, pin);
        assert.equal(second.body.pin, pin);

        const rows = await db.query('SELECT * FROM pins WHERE orderRef = ?', [reference]);
        assert.equal(rows.length, 1);
    });

    await t.test('PIN verification returns only the purchased subject content', async function () {
        const res = await call(verifyApi, postOptions({
            pin: pin,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.1.1' }));

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.exam.name, 'WAEC');
        assert.equal(res.body.subjects.length, 1);
        assert.equal(res.body.subjects[0].name, 'English Language');
        assert.equal(res.body.subjects[0].content, 'SECRET ANSWER CONTENT');
        assert.deepEqual(res.body.subjects[0].qaImages, ['https://cdn.example.com/qa-1.png']);

        const wrongDevice = await call(verifyApi, postOptions({
            pin: pin,
            deviceId: 'DEV-SOMEONEELSE'
        }, { 'x-forwarded-for': '10.2.1.2' }));
        assert.equal(wrongDevice.statusCode, 403);

        const invalid = await call(verifyApi, postOptions({
            pin: 'NOPE1234',
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.2.1.3' }));
        assert.equal(invalid.statusCode, 404);
    });

    await t.test('admin endpoints require a session', async function () {
        const stats = await call(adminStatsApi, { url: '/api/admin/stats' });
        assert.equal(stats.statusCode, 401);

        const exams = await call(adminExamsApi, { url: '/api/admin/exams' });
        assert.equal(exams.statusCode, 401);
    });

    await t.test('admin login rejects a wrong password', async function () {
        const res = await call(adminLoginApi, postOptions(
            { password: 'wrong-password' },
            { 'x-forwarded-for': '10.3.0.1' }
        ));
        assert.equal(res.statusCode, 401);
    });

    await t.test('admin login sets a signed HttpOnly session cookie', async function () {
        const res = await call(adminLoginApi, postOptions(
            { password: 'test-admin-password' },
            { 'x-forwarded-for': '10.3.0.2' }
        ));

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.authenticated, true);
        assert.match(res.headers['set-cookie'], /HttpOnly/);
        assert.match(res.headers['set-cookie'], /SameSite=Strict/);

        adminCookie = extractCookie(res);
        assert.match(adminCookie, /^sa_admin=.+/);

        const session = await call(adminSessionApi, {
            url: '/api/admin/session',
            headers: { cookie: adminCookie }
        });
        assert.equal(session.statusCode, 200);
        assert.equal(session.body.authenticated, true);
    });

    await t.test('admin stats show sold PINs and revenue', async function () {
        const res = await call(adminStatsApi, {
            url: '/api/admin/stats',
            headers: { cookie: adminCookie }
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.totalPinsSold >= 1, true);
        assert.equal(res.body.paidOrders >= 1, true);
        assert.equal(res.body.revenue >= 1000, true);
        assert.equal(res.body.totalOrders >= 1, true);
    });

    await t.test('admin can read and update exam content', async function () {
        const list = await call(adminExamsApi, {
            url: '/api/admin/exams',
            headers: { cookie: adminCookie }
        });
        assert.equal(list.statusCode, 200);
        assert.equal(list.body.length, 9);

        const full = await call(adminExamsApi, {
            url: '/api/admin/exams?id=1',
            headers: { cookie: adminCookie }
        });
        assert.equal(full.statusCode, 200);
        assert.equal(full.body.subjects.length, 26);
        assert.equal(full.body.subjects[0].content, 'SECRET ANSWER CONTENT');

        const update = await call(adminSubjectsApi, {
            method: 'PUT',
            url: '/api/admin/subjects?examId=1&name=English%20Language',
            headers: { cookie: adminCookie },
            body: {
                content: 'UPDATED CONTENT',
                thumbnail: 'https://cdn.example.com/new-thumb.png',
                qaImages: ['https://cdn.example.com/new-qa.png']
            }
        });
        assert.equal(update.statusCode, 200);
        assert.equal(update.body.subject.content, 'UPDATED CONTENT');

        const refreshed = await getExam('1');
        const english = refreshed.subjects.find(function (subject) { return subject.name === 'English Language'; });
        assert.equal(english.content, 'UPDATED CONTENT');
    });

    await t.test('admin PIN history includes active and pending PINs', async function () {
        const res = await call(adminPinsApi, {
            url: '/api/admin/pins',
            headers: { cookie: adminCookie }
        });
        assert.equal(res.statusCode, 200);
        const paid = res.body.find(function (item) { return item.pin === pin; });
        assert.ok(paid);
        assert.equal(paid.active, true);
        assert.equal(paid.examName, 'WAEC');
    });

    await t.test('admin can create a manual PIN', async function () {
        const res = await call(adminPinsApi, {
            method: 'POST',
            url: '/api/admin/pins',
            headers: { cookie: adminCookie },
            body: {
                examId: '1',
                subjects: ['Mathematics'],
                deviceId: 'DEV-MANUAL123',
                manualPin: 'MANUAL1'
            }
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.pin, 'MANUAL1');

        const row = await db.queryOne('SELECT * FROM pins WHERE pin = ?', ['MANUAL1']);
        assert.equal(Number(row.active), 1);
        assert.deepEqual(JSON.parse(row.subjects), ['Mathematics']);
    });

    let newsId = null;

    await t.test('admin can create, update and delete news', async function () {
        const created = await call(adminNewsApi, {
            method: 'POST',
            url: '/api/admin/news',
            headers: { cookie: adminCookie },
            body: {
                title: 'Exam timetable released',
                content: 'Check the timetable now.',
                images: ['https://cdn.example.com/news.png']
            }
        });
        assert.equal(created.statusCode, 200);
        newsId = created.body.id;

        const list = await call(adminNewsApi, {
            url: '/api/admin/news',
            headers: { cookie: adminCookie }
        });
        assert.equal(list.statusCode, 200);
        assert.equal(list.body.some(function (item) { return item.id === newsId; }), true);

        const updated = await call(adminNewsApi, {
            method: 'PUT',
            url: '/api/admin/news?id=' + newsId,
            headers: { cookie: adminCookie },
            body: {
                id: newsId,
                title: 'Updated timetable',
                content: 'The timetable changed.',
                images: []
            }
        });
        assert.equal(updated.statusCode, 200);

        const afterUpdate = await call(adminNewsApi, {
            url: '/api/admin/news',
            headers: { cookie: adminCookie }
        });
        const item = afterUpdate.body.find(function (entry) { return entry.id === newsId; });
        assert.equal(item.title, 'Updated timetable');
        assert.deepEqual(item.images, []);
    });

    await t.test('public enquiries can be listed and marked replied', async function () {
        const created = await call(enquiriesApi, postOptions({
            name: 'Ada Student',
            email: 'ada@example.com',
            phone: '+2348000000000',
            exam: 'WAEC',
            message: 'Please help with my PIN.'
        }, { 'x-forwarded-for': '10.4.0.1' }));
        assert.equal(created.statusCode, 200);

        const list = await call(adminEnquiriesApi, {
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie }
        });
        assert.equal(list.statusCode, 200);
        const enquiry = list.body.find(function (entry) { return entry.email === 'ada@example.com'; });
        assert.ok(enquiry);

        const replied = await call(adminEnquiriesApi, {
            method: 'POST',
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie },
            body: { id: enquiry.id, message: 'We have sent your PIN.', markOnly: true }
        });
        assert.equal(replied.statusCode, 200);
        assert.equal(replied.body.emailed, false);

        const afterReply = await call(adminEnquiriesApi, {
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie }
        });
        const updated = afterReply.body.find(function (entry) { return entry.id === enquiry.id; });
        assert.notEqual(updated.repliedAt, null);
    });

    await t.test('admin can request a presigned R2 upload', async function () {
        const res = await call(adminUploadApi, {
            method: 'POST',
            url: '/api/admin/upload',
            headers: { cookie: adminCookie },
            body: {
                fileName: 'answer.png',
                contentType: 'image/png',
                fileSize: 2048
            }
        });

        assert.equal(res.statusCode, 200);
        assert.match(res.body.uploadUrl, /X-Amz-Signature=/);
        assert.match(res.body.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\//);
    });

    await t.test('logout clears the session cookie', async function () {
        const res = await call(adminLogoutApi, {
            method: 'POST',
            url: '/api/admin/logout',
            headers: { cookie: adminCookie }
        });

        assert.equal(res.statusCode, 200);
        assert.match(res.headers['set-cookie'], /Max-Age=0/);
    });

    await t.test('rate limiting blocks repeated attempts', async function () {
        const { enforceRateLimit } = require('../lib/rate-limit');
        await enforceRateLimit('test:integration:limit', 2, 60);
        await enforceRateLimit('test:integration:limit', 2, 60);

        await assert.rejects(
            function () {
                return enforceRateLimit('test:integration:limit', 2, 60);
            },
            function (err) {
                return err && err.status === 429;
            }
        );
    });

    await t.test('deleting the news item removes it', async function () {
        const res = await call(adminNewsApi, {
            method: 'DELETE',
            url: '/api/admin/news?id=' + newsId,
            headers: { cookie: adminCookie }
        });
        assert.equal(res.statusCode, 200);

        const list = await call(adminNewsApi, {
            url: '/api/admin/news',
            headers: { cookie: adminCookie }
        });
        assert.equal(list.body.some(function (item) { return item.id === newsId; }), false);
    });
});
