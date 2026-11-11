const test = require('node:test');
const assert = require('node:assert/strict');

process.env.R2_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'success-academy-test';
process.env.R2_PUBLIC_URL = 'https://cdn.example.com/';

const r2 = require('../lib/r2');

const { extensionFor, normalizeContentType, uploadImage } = r2;

function fakeClient() {
    const sent = [];
    return {
        sent: sent,
        send: async function (command) {
            sent.push(command);
            return { ETag: 'fake-etag' };
        }
    };
}

test('image extensions and content types are normalized', function () {
    assert.equal(extensionFor('image/png', 'photo.png'), 'png');
    assert.equal(extensionFor('', 'photo.JPEG'), 'jpg');
    assert.equal(normalizeContentType('image/webp', 'photo.webp'), 'image/webp');
    assert.equal(normalizeContentType('', 'photo.gif'), 'image/gif');

    assert.throws(function () {
        extensionFor('application/pdf', 'document.pdf');
    }, function (err) {
        return err && err.status === 400;
    });
});

test('images are uploaded to R2 from the server', async function () {
    const client = fakeClient();
    r2.__setTestClient(client);

    const body = Buffer.from('fake-png-bytes');
    const result = await uploadImage({
        body: body,
        fileName: 'answer-sheet.png',
        contentType: 'image/png'
    });

    assert.equal(client.sent.length, 1);
    assert.equal(client.sent[0].input.Bucket, 'success-academy-test');
    assert.equal(client.sent[0].input.Body, body);
    assert.match(result.key, /^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png$/);
    assert.match(result.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\/\d{4}-\d{2}-\d{2}\//);
    assert.equal(result.size, body.length);
});

test('oversized, empty and unsupported images are rejected', async function () {
    r2.__setTestClient(fakeClient());

    await assert.rejects(
        uploadImage({ body: Buffer.alloc(5 * 1024 * 1024), fileName: 'huge.png', contentType: 'image/png' }),
        function (err) { return err && err.status === 413; }
    );

    await assert.rejects(
        uploadImage({ body: Buffer.alloc(0), fileName: 'empty.png', contentType: 'image/png' }),
        function (err) { return err && err.status === 400; }
    );

    await assert.rejects(
        uploadImage({ body: Buffer.alloc(1000), fileName: 'notes.pdf', contentType: 'application/pdf' }),
        function (err) { return err && err.status === 400; }
    );
});
