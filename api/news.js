const { getConn, withRetry, withTimeout, json } = require('./_db.js');

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

module.exports = async (req, res) => {
    const TIMEOUT_MS = 30000;
    const id = req.query.id || '';

    if (req.method === 'GET' && !id) {
        try {
            const result = await withRetry(() =>
                withTimeout(async () => {
                    const conn = getConn();
                    const stmt = await conn.prepare("SELECT * FROM news ORDER BY date DESC");
                    return await stmt.all();
                }, TIMEOUT_MS, 'GET news')
            );
            const formatted = result.map(row => ({
                id: row.id,
                title: row.title,
                content: row.content,
                images: JSON.parse(row.images || '[]'),
                date: row.date
            }));
            json(res, 200, formatted);
        } catch (err) {
            console.error('[news] GET ERROR:', err.message);
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'POST' && !id) {
        let body = '';
        for await (const chunk of req) body += chunk;
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
            await withRetry(() =>
                withTimeout(async () => {
                    const conn = getConn();
                    const stmt = await conn.prepare("INSERT INTO news (title, content, images, date) VALUES (?, ?, ?, ?)");
                    return await stmt.run(title, content, JSON.stringify(images || []), new Date().toISOString());
                }, TIMEOUT_MS, 'INSERT news')
            );
            json(res, 200, { success: true });
        } catch (err) {
            console.error('[news] POST ERROR:', err.message);
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id) {
        let body = '';
        for await (const chunk of req) body += chunk;
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
            await withRetry(() =>
                withTimeout(async () => {
                    const conn = getConn();
                    const stmt = await conn.prepare("UPDATE news SET title = ?, content = ?, images = ? WHERE id = ?");
                    return await stmt.run(title, content, JSON.stringify(images || []), id);
                }, TIMEOUT_MS, 'UPDATE news')
            );
            json(res, 200, { success: true });
        } catch (err) {
            console.error('[news] PUT ERROR:', err.message);
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'DELETE' && id) {
        try {
            await withRetry(() =>
                withTimeout(async () => {
                    const conn = getConn();
                    const stmt = await conn.prepare("DELETE FROM news WHERE id = ?");
                    return await stmt.run(id);
                }, TIMEOUT_MS, 'DELETE news')
            );
            json(res, 200, { success: true });
        } catch (err) {
            console.error('[news] DELETE ERROR:', err.message);
            json(res, 500, { error: err.message });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
};
