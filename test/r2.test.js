const test = require('node:test');
const assert = require('node:assert/strict');

process.env.R2_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'success-academy-test';
process.env.R2_PUBLIC_URL = 'https://cdn.example.com/';

const {
    extensionFor,
    normalizeContentType,
    createPresignedUpload
} = require('../lib/r2');

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

test('presigned uploads are generated without contacting R2', async function () {
    const result = await createPresignedUpload({
        fileName: 'answer-sheet.png',
        contentType: 'image/png',
        fileSize: 4096
    });

    assert.match(result.uploadUrl, /X-Amz-Signature=/);
    assert.match(result.uploadUrl, /success-academy-test/);
    assert.match(result.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\/\d{4}-\d{2}-\d{2}\//);
    assert.match(result.publicUrl, /\.png$/);
    assert.equal(result.expiresIn, 300);
});

test('oversized and unsupported files are rejected', async function () {
    await assert.rejects(
        createPresignedUpload({ fileName: 'huge.png', contentType: 'image/png', fileSize: 9 * 1024 * 1024 }),
        function (err) { return err && err.status === 400; }
    );

    await assert.rejects(
        createPresignedUpload({ fileName: 'notes.pdf', contentType: 'application/pdf', fileSize: 1000 }),
        function (err) { return err && err.status === 400; }
    );
});
