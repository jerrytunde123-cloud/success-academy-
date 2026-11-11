const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    const id = req.query.id || '';

    if (req.method === 'GET' && !id) {
        try {
            const result = await client.execute('SELECT * FROM news ORDER BY date DESC');
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
        try {
            const { title, content, images } = await parseBody(req);
            if (!title || !content) {
                json(res, 400, { error: 'title and content are required' });
                return;
            }
            await client.execute({
                sql: 'INSERT INTO news (title, content, images, date) VALUES (?, ?, ?, ?)',
                args: [title, content, JSON.stringify(images || []), new Date().toISOString()]
            });
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id) {
        try {
            const { title, content, images } = await parseBody(req);
            if (!title || !content) {
                json(res, 400, { error: 'title and content are required' });
                return;
            }
            await client.execute({
                sql: 'UPDATE news SET title = ?, content = ?, images = ? WHERE id = ?',
                args: [title, content, JSON.stringify(images || []), id]
            });
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'DELETE' && id) {
        try {
            await client.execute({ sql: 'DELETE FROM news WHERE id = ?', args: [id] });
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
};
