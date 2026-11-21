// Stock of WAEC / NECO result-checker credentials. Each physical PIN or token
// is stored once and can only be sold once.

const { execute, query, queryOne } = require('./db');
const { HttpError } = require('./http');
const { isUniqueError } = require('./pins');

const RESERVED_TTL_MS = 30 * 60 * 1000;
const MAX_LINES = 500;

function parsePin(row) {
    if (!row) {
        return null;
    }
    return {
        id: Number(row.id),
        productId: String(row.productId),
        productName: row.productName || null,
        pin: String(row.pin),
        serial: String(row.serial || ''),
        batch: String(row.batch || ''),
        status: String(row.status),
        orderRef: row.orderRef || null,
        email: row.email || null,
        deviceId: row.deviceId || null,
        createdAt: row.createdAt,
        soldAt: row.soldAt || null
    };
}

function normalizeResultPin(raw, product) {
    const value = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '');
    const isWaecLike = Boolean(product && product.serialRequired);
    const valid = isWaecLike ? /^\d{10,12}$/.test(value) : /^\d{12}$/.test(value);
    if (!valid) {
        throw new HttpError(
            400,
            isWaecLike
                ? 'WAEC e-PINs must be 10 or 12 digits.'
                : 'NECO tokens must be 12 digits.'
        );
    }
    return value;
}

function normalizeSerial(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!value) {
        return '';
    }
    if (!/^[A-Z0-9-]{4,40}$/.test(value)) {
        throw new HttpError(400, 'A serial must be 4–40 letters, numbers or hyphens.');
    }
    return value;
}

function parseInputLine(line, product, lineNumber) {
    const trimmed = String(line || '').trim();
    let parts = trimmed.split(/[,\t]+/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length === 1) {
        parts = trimmed.split(/\s+/).filter(Boolean);
    }
    if (parts.length === 0) {
        return null;
    }
    try {
        const pin = normalizeResultPin(parts[0], product);
        const serial = parts[1] ? normalizeSerial(parts[1]) : '';
        if (product.serialRequired && !serial) {
            throw new HttpError(400, 'A WAEC serial number is required (PIN, SERIAL).');
        }
        if (parts.length > 2) {
            throw new HttpError(400, 'Use one "PIN, SERIAL" per line.');
        }
        return { pin: pin, serial: serial };
    } catch (err) {
        if (err instanceof HttpError) {
            return { error: 'Line ' + lineNumber + ': ' + err.message };
        }
        throw err;
    }
}

async function addPins(input) {
    const lines = String(input.lines || '').split(/\r?\n/);
    if (lines.length > MAX_LINES) {
        throw new HttpError(400, 'Add at most ' + MAX_LINES + ' PINs at a time.');
    }

    const errors = [];
    const valid = [];
    lines.forEach(function (line, index) {
        if (!line.trim()) {
            return;
        }
        const parsed = parseInputLine(line, input.product, index + 1);
        if (!parsed) {
            return;
        }
        if (parsed.error) {
            errors.push(parsed.error);
            return;
        }
        valid.push(parsed);
    });

    if (errors.length > 0) {
        throw new HttpError(400, errors.slice(0, 10).join(' '));
    }
    if (valid.length === 0) {
        throw new HttpError(400, 'Enter at least one PIN.');
    }

    const createdAt = new Date().toISOString();
    let added = 0;
    let skipped = 0;
    for (const item of valid) {
        try {
            await execute(
                'INSERT INTO result_pins (productId, pin, serial, batch, status, createdAt) VALUES (?, ?, ?, ?, \'available\', ?)',
                [input.product.id, item.pin, item.serial, input.batch || '', createdAt]
            );
            added += 1;
        } catch (err) {
            if (!isUniqueError(err)) {
                throw err;
            }
            skipped += 1;
        }
    }

    return { added: added, skipped: skipped };
}

async function reservePin(productId, orderRef) {
    const cutoff = new Date(Date.now() - RESERVED_TTL_MS).toISOString();
    await execute(
        "UPDATE result_pins SET status = 'available', orderRef = NULL, reservedAt = NULL WHERE status = 'reserved' AND reservedAt < ?",
        [cutoff]
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = await queryOne(
            "SELECT * FROM result_pins WHERE productId = ? AND status = 'available' ORDER BY id ASC LIMIT 1",
            [productId]
        );
        if (!row) {
            throw new HttpError(409, 'This product is out of stock. Please check back later.');
        }
        const result = await execute(
            "UPDATE result_pins SET status = 'reserved', orderRef = ?, reservedAt = ? WHERE id = ? AND status = 'available'",
            [orderRef, new Date().toISOString(), row.id]
        );
        if (Number(result.rowsAffected || 0) > 0) {
            return parsePin(row);
        }
    }
    throw new HttpError(409, 'Stock is changing quickly. Please try again.');
}

async function releasePin(pinId, orderRef) {
    await execute(
        "UPDATE result_pins SET status = 'available', orderRef = NULL, reservedAt = NULL WHERE id = ? AND orderRef = ? AND status = 'reserved'",
        [pinId, orderRef]
    );
}

async function listStock(options) {
    const opts = options || {};
    const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);
    const clauses = [];
    const args = [];
    if (opts.productId) {
        clauses.push('rp.productId = ?');
        args.push(opts.productId);
    }
    if (opts.status) {
        clauses.push('rp.status = ?');
        args.push(opts.status);
    }
    const where = clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '';
    args.push(limit);
    const rows = await query(
        'SELECT rp.*, p.name AS productName FROM result_pins rp LEFT JOIN result_products p ON p.id = rp.productId' +
            where + ' ORDER BY rp.id DESC LIMIT ?',
        args
    );
    return rows.map(parsePin);
}

async function deletePin(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new HttpError(400, 'PIN id is invalid.');
    }
    const result = await execute("DELETE FROM result_pins WHERE id = ? AND status = 'available'", [numericId]);
    if (Number(result.rowsAffected || 0) > 0) {
        return true;
    }
    const row = await queryOne('SELECT status FROM result_pins WHERE id = ?', [numericId]);
    if (row && row.status !== 'available') {
        throw new HttpError(409, 'PINs reserved or sold to a buyer cannot be deleted.');
    }
    return false;
}

module.exports = {
    parsePin,
    normalizeResultPin,
    normalizeSerial,
    addPins,
    reservePin,
    releasePin,
    listStock,
    deletePin
};
