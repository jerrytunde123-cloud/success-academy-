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
process.env.EMAILJS_PUBLIC_KEY = 'test-emailjs-public-key';
process.env.EMAILJS_SERVICE_ID = 'service_test';
process.env.EMAILJS_TEMPLATE_ID = 'template_test';

const db = require('../lib/db');
const { ensureSchema, __resetSchemaForTests } = require('../lib/schema');
const { updateExamSubject, getExam } = require('../lib/exams');
const { getOrder } = require('../lib/orders');
const { getTutorialOrder } = require('../lib/tutorial-orders');
const r2 = require('../lib/r2');
const deletedR2Keys = [];

// R2 uploads are mocked so the tests never contact the real bucket.
r2.__setTestClient({
    send: async function (command) {
        if (command.constructor.name === 'DeleteObjectCommand') {
            deletedR2Keys.push(command.input.Key);
        }
        return { ETag: 'fake-etag' };
    }
});

const adapter = createSqliteAdapter();
db.__setTestDb(adapter);
__resetSchemaForTests();

const examsApi = require('../api/exams');
const checkoutApi = require('../api/checkout');
const tutorialsApi = require('../api/tutorials');
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
const adminOrdersApi = require('../lib/handlers/admin/orders');
const adminNewsApi = require('../lib/handlers/admin/news');
const adminEnquiriesApi = require('../lib/handlers/admin/enquiries');
const adminEmailjsApi = require('../lib/handlers/admin/emailjs');
const adminUploadApi = require('../lib/handlers/admin/upload');
const adminResultPinsApi = require('../lib/handlers/admin/result-pins');

const resultCatalogApi = require('../lib/handlers/result-pins/catalog');
const resultCheckoutApi = require('../lib/handlers/result-pins/checkout');
const resultClaimApi = require('../lib/handlers/result-pins/claim');
const resultVoucherApi = require('../lib/handlers/result-pins/voucher');
const resultEmailjsApi = require('../lib/handlers/result-pins/emailjs');
const resultEmailedApi = require('../lib/handlers/result-pins/emailed');

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

        const orders = await call(adminOrdersApi, { url: '/api/admin/orders' });
        assert.equal(orders.statusCode, 401);

        const emailjs = await call(adminEmailjsApi, { url: '/api/admin/emailjs' });
        assert.equal(emailjs.statusCode, 401);
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

    await t.test('EmailJS config is available only to admins and never hardcoded', async function () {
        const configured = await call(adminEmailjsApi, {
            url: '/api/admin/emailjs',
            headers: { cookie: adminCookie }
        });
        assert.equal(configured.statusCode, 200);
        assert.deepEqual(configured.body, {
            enabled: true,
            publicKey: 'test-emailjs-public-key',
            serviceId: 'service_test',
            templateId: 'template_test'
        });

        const saved = {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            serviceId: process.env.EMAILJS_SERVICE_ID,
            templateId: process.env.EMAILJS_TEMPLATE_ID
        };
        delete process.env.EMAILJS_PUBLIC_KEY;
        try {
            const missing = await call(adminEmailjsApi, {
                url: '/api/admin/emailjs',
                headers: { cookie: adminCookie }
            });
            assert.equal(missing.body.enabled, false);
            assert.equal(missing.body.publicKey, '');
        } finally {
            process.env.EMAILJS_PUBLIC_KEY = saved.publicKey;
            process.env.EMAILJS_SERVICE_ID = saved.serviceId;
            process.env.EMAILJS_TEMPLATE_ID = saved.templateId;
        }
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

    await t.test('admin cannot delete an order with payment still pending', async function () {
        const checkout = await call(checkoutApi, postOptions({
            examId: '1',
            packageType: 'per_subject',
            subjects: ['Mathematics'],
            email: 'pending@example.com',
            deviceId: 'DEV-PENDING123'
        }, { 'x-forwarded-for': '10.2.0.20' }));
        assert.equal(checkout.statusCode, 200);

        const deletion = await call(adminOrdersApi, {
            method: 'DELETE',
            url: '/api/admin/orders?reference=' + encodeURIComponent(checkout.body.reference),
            headers: { cookie: adminCookie }
        });
        assert.equal(deletion.statusCode, 409);
        const pendingOrder = await getOrder(checkout.body.reference);
        assert.ok(pendingOrder);
        const pendingPinDeletion = await call(adminPinsApi, {
            method: 'DELETE',
            url: '/api/admin/pins?pin=' + encodeURIComponent(pendingOrder.pin),
            headers: { cookie: adminCookie }
        });
        assert.equal(pendingPinDeletion.statusCode, 409);
        assert.ok(await db.queryOne('SELECT pin FROM pins WHERE pin = ?', [pendingOrder.pin]));
    });

    await t.test('admin order history lists recorded orders', async function () {
        const res = await call(adminOrdersApi, {
            url: '/api/admin/orders',
            headers: { cookie: adminCookie }
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.some(function (order) { return order.reference === reference; }), true);
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
                thumbnail: 'https://cdn.example.com/uploads/test/thumbnail.png',
                qaImages: ['https://cdn.example.com/uploads/test/shared-qa.png']
            }
        });
        assert.equal(update.statusCode, 200);
        assert.equal(update.body.subject.content, 'UPDATED CONTENT');

        const sharedImage = await call(adminSubjectsApi, {
            method: 'PUT',
            url: '/api/admin/subjects?examId=1&name=Mathematics',
            headers: { cookie: adminCookie },
            body: {
                content: '',
                thumbnail: '',
                qaImages: ['https://cdn.example.com/uploads/test/shared-qa.png']
            }
        });
        assert.equal(sharedImage.statusCode, 200);

        const removedImages = await call(adminSubjectsApi, {
            method: 'PUT',
            url: '/api/admin/subjects?examId=1&name=English%20Language',
            headers: { cookie: adminCookie },
            body: { content: 'UPDATED CONTENT', thumbnail: '', qaImages: [] }
        });
        assert.equal(removedImages.statusCode, 200);
        assert.equal(removedImages.body.subject.thumbnail, '');
        assert.deepEqual(removedImages.body.subject.qaImages, []);
        assert.deepEqual(deletedR2Keys, ['uploads/test/thumbnail.png']);

        const removedSharedImage = await call(adminSubjectsApi, {
            method: 'PUT',
            url: '/api/admin/subjects?examId=1&name=Mathematics',
            headers: { cookie: adminCookie },
            body: { content: '', thumbnail: '', qaImages: [] }
        });
        assert.equal(removedSharedImage.statusCode, 200);
        assert.deepEqual(deletedR2Keys, ['uploads/test/thumbnail.png', 'uploads/test/shared-qa.png']);

        const refreshed = await getExam('1');
        const english = refreshed.subjects.find(function (subject) { return subject.name === 'English Language'; });
        assert.equal(english.content, 'UPDATED CONTENT');
        assert.equal(english.thumbnail, '');
        assert.deepEqual(english.qaImages, []);
    });

    await t.test('admin can configure public tutorial details safely', async function () {
        const updated = await call(adminExamsApi, {
            method: 'PUT',
            url: '/api/admin/exams',
            headers: { cookie: adminCookie },
            body: {
                id: '1',
                tutorialPrice: 1500,
                tutorialLink: 'https://chat.whatsapp.com/example',
                tutorialBenefits: 'Live lessons and revision notes.'
            }
        });
        assert.equal(updated.statusCode, 200);
        assert.equal(updated.body.exam.tutorialPrice, 1500);
        assert.equal(updated.body.exam.tutorialLink, 'https://chat.whatsapp.com/example');

        const publicList = await call(examsApi, { url: '/api/exams' });
        const waec = publicList.body.find(function (exam) { return exam.id === '1'; });
        assert.equal(waec.tutorialPrice, 1500);
        assert.equal(waec.tutorialBenefits, 'Live lessons and revision notes.');
        assert.equal(waec.tutorialAvailable, true);
        assert.equal(Object.prototype.hasOwnProperty.call(waec, 'tutorialLink'), false);

        const invalid = await call(adminExamsApi, {
            method: 'PUT',
            url: '/api/admin/exams',
            headers: { cookie: adminCookie },
            body: { id: '1', tutorialPrice: -1 }
        });
        assert.equal(invalid.statusCode, 400);

        const missingLink = await call(adminExamsApi, {
            method: 'PUT',
            url: '/api/admin/exams',
            headers: { cookie: adminCookie },
            body: { id: '2', tutorialPrice: 1500 }
        });
        assert.equal(missingLink.statusCode, 400);
    });

    await t.test('tutorial checkout verifies stored amount and exam before revealing class link', async function () {
        const initialized = await call(tutorialsApi, postOptions({
            action: 'initialize',
            examId: '1',
            email: 'tutorial@example.com'
        }, { 'x-forwarded-for': '10.5.0.1' }));
        assert.equal(initialized.statusCode, 200);
        assert.match(initialized.body.reference, /^TUT_[A-F0-9]{16}$/);
        assert.equal(initialized.body.accessCode, 'test_access_code');

        const order = await getTutorialOrder(initialized.body.reference);
        assert.equal(order.examId, '1');
        assert.equal(order.tutorialLink, 'https://chat.whatsapp.com/example');
        assert.equal(order.amount, 150000);
        assert.equal(order.status, 'pending');

        const wrongExam = await call(tutorialsApi, postOptions({
            action: 'verify',
            examId: '2',
            reference: initialized.body.reference
        }, { 'x-forwarded-for': '10.5.0.2' }));
        assert.equal(wrongExam.statusCode, 404);

        verifyAmount = 100000;
        const wrongAmount = await call(tutorialsApi, postOptions({
            action: 'verify',
            examId: '1',
            reference: initialized.body.reference
        }, { 'x-forwarded-for': '10.5.0.3' }));
        assert.equal(wrongAmount.statusCode, 400);
        assert.equal((await getTutorialOrder(initialized.body.reference)).status, 'pending');

        verifyAmount = 150000;
        const verified = await call(tutorialsApi, postOptions({
            action: 'verify',
            reference: initialized.body.reference
        }, { 'x-forwarded-for': '10.5.0.4' }));
        assert.equal(verified.statusCode, 200);
        assert.equal(verified.body.examId, '1');
        assert.equal(verified.body.examName, 'WAEC');
        assert.equal(verified.body.link, 'https://chat.whatsapp.com/example');
        assert.equal((await getTutorialOrder(initialized.body.reference)).status, 'paid');

        await call(adminExamsApi, {
            method: 'PUT',
            url: '/api/admin/exams',
            headers: { cookie: adminCookie },
            body: { id: '1', tutorialPrice: 0, tutorialLink: '', tutorialBenefits: '' }
        });
        const verifiedAfterTutorialWasDisabled = await call(tutorialsApi, postOptions({
            action: 'verify',
            reference: initialized.body.reference
        }, { 'x-forwarded-for': '10.5.0.5' }));
        assert.equal(verifiedAfterTutorialWasDisabled.statusCode, 200);
        assert.equal(verifiedAfterTutorialWasDisabled.body.link, 'https://chat.whatsapp.com/example');
        verifyAmount = 100000;
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

    await t.test('admin can permanently delete a manual PIN', async function () {
        const deleted = await call(adminPinsApi, {
            method: 'DELETE',
            url: '/api/admin/pins?pin=MANUAL1',
            headers: { cookie: adminCookie }
        });
        assert.equal(deleted.statusCode, 200);
        assert.equal(await db.queryOne('SELECT pin FROM pins WHERE pin = ?', ['MANUAL1']), null);
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

        const attemptedServerSend = await call(adminEnquiriesApi, {
            method: 'POST',
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie },
            body: { id: enquiry.id, message: 'We have sent your PIN.' }
        });
        assert.equal(attemptedServerSend.statusCode, 400);

        const replied = await call(adminEnquiriesApi, {
            method: 'POST',
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie },
            body: { id: enquiry.id, message: 'We have sent your PIN.', recordOnly: true }
        });
        assert.equal(replied.statusCode, 200);
        assert.equal(replied.body.recorded, true);
        assert.equal(replied.body.channel, 'emailjs');

        const afterReply = await call(adminEnquiriesApi, {
            url: '/api/admin/enquiries',
            headers: { cookie: adminCookie }
        });
        const updated = afterReply.body.find(function (entry) { return entry.id === enquiry.id; });
        assert.notEqual(updated.repliedAt, null);

        const deleted = await call(adminEnquiriesApi, {
            method: 'DELETE',
            url: '/api/admin/enquiries?id=' + enquiry.id,
            headers: { cookie: adminCookie }
        });
        assert.equal(deleted.statusCode, 200);
        assert.equal(await db.queryOne('SELECT id FROM enquiries WHERE id = ?', [enquiry.id]), null);
    });

    await t.test('admin can upload an image to R2', async function () {
        const res = await call(adminUploadApi, {
            method: 'POST',
            url: '/api/admin/upload',
            headers: {
                cookie: adminCookie,
                'content-type': 'image/png',
                'x-file-name': 'answer.png'
            },
            body: Buffer.from('fake-png-bytes')
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.match(res.body.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\//);
        assert.match(res.body.publicUrl, /\.png$/);
        assert.equal(res.body.maxSizeMb, 4);
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

    await t.test('deleting a paid order also revokes its linked PIN', async function () {
        const res = await call(adminOrdersApi, {
            method: 'DELETE',
            url: '/api/admin/orders?reference=' + encodeURIComponent(reference),
            headers: { cookie: adminCookie }
        });
        assert.equal(res.statusCode, 200);
        assert.equal(await getOrder(reference), null);
        assert.equal(await db.queryOne('SELECT pin FROM pins WHERE pin = ?', [pin]), null);
    });
});

test('result checker PIN stock, checkout, claim and voucher work end to end', async function (t) {
    await ensureSchema();

    const deviceId = 'DEV-RESULTPIN1';
    let adminCookie = '';
    let reference = '';
    let claimToken = '';

    await t.test('the catalog is public and seeded with WAEC and NECO', async function () {
        const res = await call(resultCatalogApi, { url: '/api/result-pins/catalog' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.products.length, 2);

        const waec = res.body.products.find(function (product) { return product.id === 'waec'; });
        assert.equal(waec.price, 5250);
        assert.equal(waec.serialRequired, true);
        const neco = res.body.products.find(function (product) { return product.id === 'neco'; });
        assert.equal(neco.price, 2400);
        assert.equal(neco.serialRequired, false);
    });

    await t.test('result admin endpoints require a session', async function () {
        const res = await call(adminResultPinsApi, { url: '/api/admin/result-pins' });
        assert.equal(res.statusCode, 401);
    });

    await t.test('admin login allows result PIN management', async function () {
        const res = await call(adminLoginApi, postOptions(
            { password: 'test-admin-password' },
            { 'x-forwarded-for': '10.9.0.1' }
        ));
        assert.equal(res.statusCode, 200);
        adminCookie = extractCookie(res);
        assert.match(adminCookie, /^sa_admin=.+/);
    });

    await t.test('admin adds WAEC and NECO stock and rejects invalid lines', async function () {
        const bad = await call(adminResultPinsApi, postOptions({
            action: 'addPins',
            productId: 'waec',
            lines: '123\n'
        }, { cookie: adminCookie }));
        assert.equal(bad.statusCode, 400);

        const waec = await call(adminResultPinsApi, postOptions({
            action: 'addPins',
            productId: 'waec',
            lines: '1234567890, ABC12345\n1234567890, ABC12345\n987654321098, XYZ12345',
            batch: 'NOV2026'
        }, { cookie: adminCookie }));
        assert.equal(waec.statusCode, 200);
        assert.equal(waec.body.added, 2);
        assert.equal(waec.body.skipped, 1);

        const neco = await call(adminResultPinsApi, postOptions({
            action: 'addPins',
            productId: 'neco',
            lines: '000000000001\n000000000002'
        }, { cookie: adminCookie }));
        assert.equal(neco.statusCode, 200);
        assert.equal(neco.body.added, 2);
    });

    await t.test('checkout reserves one PIN and creates a pending order', async function () {
        const catalog = await call(resultCatalogApi, { url: '/api/result-pins/catalog' });
        const waec = catalog.body.products.find(function (product) { return product.id === 'waec'; });
        assert.equal(waec.available, 2);

        const res = await call(resultCheckoutApi, postOptions({
            productId: 'waec',
            email: 'buyer@example.com',
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.9.0.2' }));
        assert.equal(res.statusCode, 200);
        assert.match(res.body.reference, /^RES_[A-F0-9]{16}$/);
        assert.equal(res.body.amount, 5250);
        reference = res.body.reference;

        const order = await db.queryOne('SELECT * FROM result_orders WHERE reference = ?', [reference]);
        assert.equal(order.status, 'pending');
        assert.equal(Number(order.amountKobo), 525000);

        const reserved = await db.queryOne('SELECT * FROM result_pins WHERE orderRef = ?', [reference]);
        assert.equal(reserved.status, 'reserved');
        assert.equal(reserved.serial, 'ABC12345');
    });

    await t.test('claim rejects another device and a wrong amount', async function () {
        const wrongDevice = await call(resultClaimApi, postOptions({
            reference: reference,
            deviceId: 'DEV-SOMEONEELSE'
        }, { 'x-forwarded-for': '10.9.0.3' }));
        assert.equal(wrongDevice.statusCode, 403);

        verifyAmount = 1;
        const wrongAmount = await call(resultClaimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.9.0.4' }));
        assert.equal(wrongAmount.statusCode, 400);
        verifyAmount = 525000;

        const order = await db.queryOne('SELECT status FROM result_orders WHERE reference = ?', [reference]);
        assert.equal(order.status, 'pending');
    });

    await t.test('verified payment returns the PIN and a voucher token', async function () {
        const res = await call(resultClaimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.9.0.5' }));
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.pin, '1234567890');
        assert.equal(res.body.serial, 'ABC12345');
        assert.equal(res.body.email, 'buyer@example.com');
        assert.match(res.body.claimToken, /^[a-f0-9]{32}$/);
        claimToken = res.body.claimToken;

        const order = await db.queryOne('SELECT * FROM result_orders WHERE reference = ?', [reference]);
        assert.equal(order.status, 'paid');
        const sold = await db.queryOne('SELECT * FROM result_pins WHERE orderRef = ?', [reference]);
        assert.equal(sold.status, 'sold');
    });

    await t.test('a second claim is idempotent', async function () {
        const res = await call(resultClaimApi, postOptions({
            reference: reference,
            deviceId: deviceId
        }, { 'x-forwarded-for': '10.9.0.6' }));
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.claimToken, claimToken);
    });

    await t.test('the PDF voucher requires a valid claim token', async function () {
        const invalid = await call(resultVoucherApi, {
            url: '/api/result-pins/voucher?reference=' + reference + '&token=wrong'
        });
        assert.equal(invalid.statusCode, 404);

        const valid = await call(resultVoucherApi, {
            url: '/api/result-pins/voucher?reference=' + reference + '&token=' + claimToken
        });
        assert.equal(valid.statusCode, 200);
        assert.equal(valid.headers['content-type'], 'application/pdf');
        assert.equal(String(valid.body).slice(0, 4), '%PDF');
        assert.equal(String(valid.body).includes('1234567890'), true);
    });

    await t.test('receipt config is public and send outcomes are recorded', async function () {
        const config = await call(resultEmailjsApi, { url: '/api/result-pins/emailjs' });
        assert.equal(config.statusCode, 200);
        assert.equal(config.body.enabled, true);
        assert.equal(config.body.templateId, 'template_test');
        assert.equal(Object.prototype.hasOwnProperty.call(config.body, 'privateKey'), false);

        const recorded = await call(resultEmailedApi, postOptions({
            reference: reference,
            token: claimToken
        }, { 'x-forwarded-for': '10.9.0.7' }));
        assert.equal(recorded.statusCode, 200);
        const order = await db.queryOne('SELECT emailedAt FROM result_orders WHERE reference = ?', [reference]);
        assert.notEqual(order.emailedAt, null);
    });

    await t.test('admin can edit prices but cannot delete a sold PIN', async function () {
        const save = await call(adminResultPinsApi, postOptions({
            action: 'saveProducts',
            products: [{
                id: 'waec',
                price: 5250,
                cost: 2400,
                portalUrl: 'https://www.waecdirect.org/',
                instructions: 'Use your PIN on waecdirect.org.',
                active: true
            }]
        }, { cookie: adminCookie }));
        assert.equal(save.statusCode, 200);
        assert.equal(save.body.products[0].cost, 2400);

        const sold = await db.queryOne('SELECT id FROM result_pins WHERE orderRef = ?', [reference]);
        const del = await call(adminResultPinsApi, postOptions({
            action: 'deletePin',
            id: Number(sold.id)
        }, { cookie: adminCookie }));
        assert.equal(del.statusCode, 409);
    });
});
