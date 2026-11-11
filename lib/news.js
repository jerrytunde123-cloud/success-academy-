const { execute, query, queryOne } = require('./db');

function parseImages(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(function (image) {
            return typeof image === 'string' && image;
        });
    } catch (_err) {
        return [];
    }
}

function parseNewsRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: Number(row.id),
        title: row.title || '',
        content: row.content || '',
        images: parseImages(row.images),
        date: row.date,
        updatedAt: row.updatedAt || null
    };
}

async function listNews(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const rows = await query('SELECT * FROM news ORDER BY date DESC LIMIT ?', [safeLimit]);
    return rows.map(parseNewsRow);
}

async function getNewsItem(id) {
    const row = await queryOne('SELECT * FROM news WHERE id = ?', [id]);
    return parseNewsRow(row);
}

async function createNews(input) {
    const now = new Date().toISOString();
    const result = await execute(
        'INSERT INTO news (title, content, images, date, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [input.title, input.content, JSON.stringify(input.images), now, now]
    );
    return result.lastInsertRowid === null || result.lastInsertRowid === undefined
        ? null
        : Number(result.lastInsertRowid);
}

async function updateNews(id, input) {
    const now = new Date().toISOString();
    const result = await execute(
        'UPDATE news SET title = ?, content = ?, images = ?, updatedAt = ? WHERE id = ?',
        [input.title, input.content, JSON.stringify(input.images), now, id]
    );
    return Number(result.rowsAffected || 0) > 0;
}

async function deleteNews(id) {
    const result = await execute('DELETE FROM news WHERE id = ?', [id]);
    return Number(result.rowsAffected || 0) > 0;
}

module.exports = {
    parseNewsRow,
    listNews,
    getNewsItem,
    createNews,
    updateNews,
    deleteNews
};
