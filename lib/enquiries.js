const { execute, query, queryOne } = require('./db');

function parseEnquiryRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: Number(row.id),
        name: row.name || '',
        email: row.email || '',
        phone: row.phone || '',
        exam: row.exam || '',
        message: row.message || '',
        date: row.date,
        repliedAt: row.repliedAt || null
    };
}

async function createEnquiry(input) {
    const result = await execute(
        'INSERT INTO enquiries (name, email, phone, exam, message, date, repliedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)',
        [input.name, input.email, input.phone, input.exam, input.message, new Date().toISOString()]
    );
    return result.lastInsertRowid === null || result.lastInsertRowid === undefined
        ? null
        : Number(result.lastInsertRowid);
}

async function listEnquiries(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
    const rows = await query('SELECT * FROM enquiries ORDER BY date DESC LIMIT ?', [safeLimit]);
    return rows.map(parseEnquiryRow);
}

async function getEnquiry(id) {
    const row = await queryOne('SELECT * FROM enquiries WHERE id = ?', [id]);
    return parseEnquiryRow(row);
}

async function markEnquiryReplied(id) {
    await execute('UPDATE enquiries SET repliedAt = ? WHERE id = ?', [new Date().toISOString(), id]);
}

module.exports = {
    parseEnquiryRow,
    createEnquiry,
    listEnquiries,
    getEnquiry,
    markEnquiryReplied
};
