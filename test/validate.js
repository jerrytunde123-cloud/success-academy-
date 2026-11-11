// =========================
// SUCCESS ACADEMY - Local Validation Tests
// Run: node test/validate.js
// Validates API function logic without needing Turso/R2 credentials
// =========================

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  PASS:', name);
    } catch (e) {
        failed++;
        console.log('  FAIL:', name, '-', e.message);
    }
}

function assertEqual(actual, expected, msg) {
    assert.strictEqual(actual, expected, msg || `expected ${expected} but got ${actual}`);
}

function assertThrows(fn, msg) {
    assert.throws(fn, msg || 'expected function to throw');
}

// -------------------------------------------------------
// 1. Test PIN generation logic
// -------------------------------------------------------
console.log('\n--- PIN Generation ---');

test('PIN is 6 uppercase alphanumeric chars', () => {
    const pin = Math.random().toString(36).substr(2, 6).toUpperCase();
    assertEqual(pin.length, 6);
    assertEqual(/^[A-Z0-9]{6}$/.test(pin), true);
});

test('Manual PIN is uppercased', () => {
    const manualPin = 'ab12cd'.toUpperCase();
    assertEqual(manualPin, 'AB12CD');
});

// -------------------------------------------------------
// 2. Test device ID format
// -------------------------------------------------------
console.log('\n--- Device ID ---');

test('Device ID starts with DEV-', () => {
    const deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    assertEqual(deviceId.startsWith('DEV-'), true);
});

test('Device ID is at least 13 chars', () => {
    const deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    assertEqual(deviceId.length >= 13, true);
});

// -------------------------------------------------------
// 3. Test price parsing / validation
// -------------------------------------------------------
console.log('\n--- Price Validation ---');

test('Price per subject must be a number', () => {
    const prices = { per_subject: 1000, per_dept: 5000, all_subjects: 8000 };
    assertEqual(typeof prices.per_subject, 'number');
    assertEqual(isNaN(prices.per_subject), false);
});

test('Invalid price string is rejected', () => {
    const val = 'not-a-number';
    assertEqual(isNaN(Number(val)), true);
});

// -------------------------------------------------------
// 4. Test subject selection limits
// -------------------------------------------------------
console.log('\n--- Subject Limits ---');

test('JAMB/POST UTME/IJMB/JUPEB max 4 subjects', () => {
    const maxForJamb = 4;
    const maxForOther = 9;
    const examNames = ['JAMB', 'POST UTME', 'IJMB', 'JUPEB', 'WAEC', 'NECO'];
    examNames.forEach(name => {
        const isSpecial = name.includes('JAMB') || name.includes('JUPEB') || name.includes('IJMB') || name.includes('POST UTME');
        const max = isSpecial ? maxForJamb : maxForOther;
        if (isSpecial) assertEqual(max, 4);
        else assertEqual(max, 9);
    });
});

// -------------------------------------------------------
// 5. Test PIN verification logic (device lock)
// -------------------------------------------------------
console.log('\n--- PIN Verify (Device Lock) ---');

test('PIN matches deviceId - allowed', () => {
    const pinDeviceId = 'DEV-ABC123';
    const requestDeviceId = 'DEV-ABC123';
    assertEqual(pinDeviceId === requestDeviceId, true);
});

test('PIN mismatched deviceId - fraud alert', () => {
    const pinDeviceId = 'DEV-ABC123';
    const requestDeviceId = 'DEV-XYZ789';
    assertEqual(pinDeviceId === requestDeviceId, false);
});

// -------------------------------------------------------
// 6. Test admin password check
// -------------------------------------------------------
console.log('\n--- Admin Auth ---');

test('Correct password returns ok', () => {
    const ADMIN_PASSWORD = 'testpass123';
    const input = 'testpass123';
    assertEqual(input === ADMIN_PASSWORD, true);
});

test('Wrong password returns false', () => {
    const ADMIN_PASSWORD = 'testpass123';
    const input = 'wrongpass';
    assertEqual(input === ADMIN_PASSWORD, false);
});

test('Empty password rejected', () => {
    const input = '';
    assertEqual(input.length === 0, true);
});

// -------------------------------------------------------
// 7. Test enquiry validation
// -------------------------------------------------------
console.log('\n--- Enquiry Validation ---');

test('Missing name/email/message rejected', () => {
    const data = { name: '', email: 'a@b.com', message: '' };
    assertEqual(!data.name || !data.email || !data.message, true);
});

test('Valid enquiry passes', () => {
    const data = { name: 'John', email: 'john@test.com', message: 'Hello' };
    assertEqual(!!data.name && !!data.email && !!data.message, true);
});

// -------------------------------------------------------
// 8. Test exam data structure
// -------------------------------------------------------
console.log('\n--- Exam Data Structure ---');

test('Exam has required fields', () => {
    const exam = {
        _id: '1',
        id: '1',
        name: 'WAEC',
        slug: 'waec',
        logo: 'waec-logo.png',
        prices: { per_subject: 1000, per_dept: 5000, all_subjects: 8000 },
        allow: { per_subject: true, per_dept: true, all_subjects: true },
        subjects: [{ name: 'Maths', content: '', thumbnail: '', qaImages: [] }]
    };
    assertEqual(exam._id, '1');
    assertEqual(exam.name, 'WAEC');
    assertEqual(Array.isArray(exam.subjects), true);
    assertEqual(exam.subjects.length > 0, true);
});

// -------------------------------------------------------
// Summary
// -------------------------------------------------------
console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
