const { createClient } = require('@libsql/client');

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);
}

module.exports = async (req, res) => {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        json(res, 500, { error: 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.' });
        return;
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const TIMEOUT_MS = 10000;
    const id = req.query.id || '';

    if (req.method === 'GET' && !id) {
        try {
            const result = await withTimeout(client.execute('SELECT * FROM news ORDER BY date DESC'), TIMEOUT_MS, 'GET news');
            const formatted = result.rows.map(row => ({
                id: row.id,
                title: row.title,
                content: row.content,
                images: JSON.parse(row.images || '[]'),
                date: row.date
            }));
            json(res, 200, formatted);
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'POST' && !id) {
        let body = '';
        for await (const chunk of req) {body += chunk;}
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch (e) {
            json(res, 400, { error: 'Invalid JSON body' });
            return;
        }
        const { title, content, images } = parsed;
        if (!title || !content) {
            json(res, 400, { error: 'title and content are required' });
            return;
        }
        try {
            await withTimeout(client.execute({
                sql: 'INSERT INTO news (title, content, images, date) VALUES (?, ?, ?, ?)',
                args: [title, content, JSON.stringify(images || []), new Date().toISOString()]
            }), TIMEOUT_MS, 'INSERT news');
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id) {
        let body = '';
        for await (const chunk of req) {body += chunk;}
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch (e) {
            json(res, 400, { error: 'Invalid JSON body' });
            return;
        }
        const { title, content, images } = parsed;
        if (!title || !content) {
            json(res, 400, { error: 'title and content are required' });
            return;
        }
        try {
            await withTimeout(client.execute({
                sql: 'UPDATE news SET title = ?, content = ?, images = ? WHERE id = ?',
                args: [title, content, JSON.stringify(images || []), id]
            }), TIMEOUT_MS, 'UPDATE news');
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'DELETE' && id) {
        try {
            await withTimeout(client.execute({ sql: 'DELETE FROM news WHERE id = ?', args: [id] }), TIMEOUT_MS, 'DELETE news');
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
};
