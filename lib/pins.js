const crypto = require('crypto');
const { execute, query, queryOne } = require('./db');
const { HttpError } = require('./http');
const { PIN_ALPHABET, PIN_LENGTH } = require('./constants');

function generatePin(length) {
    const size = length || PIN_LENGTH;
    let result = '';
    for (let index = 0; index < size; index++) {
        result += PIN_ALPHABET[crypto.randomInt(0, PIN_ALPHABET.length)];
    }
    return result;
}

function normalizePin(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(value)) {
        throw new HttpError(400, 'A PIN must be 6–12 letters or numbers.');
    }
    return value;
}

function isUniqueError(err) {
    return String((err && err.message) || '').toLowerCase().indexOf('unique constraint failed') !== -1;
}

function parseSubjects(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map(function (subject) {
            if (typeof subject === 'string') {
                return subject;
            }
            return subject && typeof subject.name === 'string' ? subject.name : '';
        }).filter(Boolean);
    } catch (_err) {
        return [];
    }
}

function parsePinRow(row) {
    if (!row) {
        return null;
    }
    return {
        pin: row.pin,
        examId: row.examId,
        subjects: parseSubjects(row.subjects),
        deviceId: row.deviceId,
        date: row.date,
        orderRef: row.orderRef || null,
        active: Number(row.active) === 1,
        lastUsedAt: row.lastUsedAt || null,
        examName: row.examName || null
    };
}

async function createManualPin(input) {
    const date = new Date().toISOString();
    const sql = 'INSERT INTO pins (pin, examId, subjects, deviceId, date, orderRef, active, lastUsedAt) VALUES (?, ?, ?, ?, ?, NULL, 1, NULL)';
    const subjectsJson = JSON.stringify(input.subjects);

    if (input.pin) {
        const pin = normalizePin(input.pin);
        try {
            await execute(sql, [pin, input.examId, subjectsJson, input.deviceId, date]);
        } catch (err) {
            if (isUniqueError(err)) {
                throw new HttpError(409, 'That PIN already exists. Please choose another one.');
            }
            throw err;
        }
        return pin;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const pin = generatePin();
        try {
            await execute(sql, [pin, input.examId, subjectsJson, input.deviceId, date]);
            return pin;
        } catch (err) {
            if (!isUniqueError(err)) {
                throw err;
            }
        }
    }

    throw new HttpError(500, 'Could not generate a unique PIN. Please try again.');
}

async function findActivePin(pin) {
    const row = await queryOne('SELECT * FROM pins WHERE pin = ? AND active = 1', [pin]);
    return parsePinRow(row);
}

async function activatePinForOrder(orderRef) {
    await execute('UPDATE pins SET active = 1 WHERE orderRef = ?', [orderRef]);
}

async function touchPin(pin) {
    await execute('UPDATE pins SET lastUsedAt = ? WHERE pin = ?', [new Date().toISOString(), pin]);
}

async function listActivePins(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
    const rows = await query(
        'SELECT p.*, e.name AS examName FROM pins p LEFT JOIN exams e ON p.examId = e.id WHERE p.active = 1 ORDER BY p.date DESC LIMIT ?',
        [safeLimit]
    );
    return rows.map(parsePinRow);
}

async function listPins(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const rows = await query(
        'SELECT p.*, e.name AS examName FROM pins p LEFT JOIN exams e ON p.examId = e.id ORDER BY p.date DESC LIMIT ?',
        [safeLimit]
    );
    return rows.map(parsePinRow);
}

async function deletePin(pin) {
    const result = await execute(
        "DELETE FROM pins WHERE pin = ? AND NOT EXISTS (SELECT 1 FROM orders WHERE reference = pins.orderRef AND status = 'pending')",
        [pin]
    );
    if (Number(result.rowsAffected || 0) > 0) {
        return true;
    }

    const row = await queryOne(
        'SELECT p.pin, o.status AS orderStatus FROM pins p LEFT JOIN orders o ON p.orderRef = o.reference WHERE p.pin = ?',
        [pin]
    );
    if (row && row.orderStatus === 'pending') {
        throw new HttpError(409, 'PINs linked to pending payments cannot be deleted.');
    }
    return false;
}

module.exports = {
    generatePin,
    normalizePin,
    isUniqueError,
    parseSubjects,
    parsePinRow,
    createManualPin,
    findActivePin,
    activatePinForOrder,
    touchPin,
    listActivePins,
    listPins,
    deletePin
};
