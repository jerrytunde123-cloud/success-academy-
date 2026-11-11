const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const id = req.query.id || '';

    // GET all news
    if (req.method === 'GET' && !id) {
        try {
            const result = await client.execute("SELECT * FROM news ORDER BY date DESC");
            const formatted = result.rows.map(row => ({
                id: row.id,
                title: row.title,
                content: row.content,
                images: JSON.parse(row.images || '[]'),
                date: row.date
            }));
            res.status(200).json(formatted);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // POST create news
    if (req.method === 'POST' && !id) {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            const { title, content, images } = JSON.parse(body);
            await client.execute({
                sql: "INSERT INTO news (title, content, images, date) VALUES (?, ?, ?, ?)",
                args: [title, content, JSON.stringify(images || []), new Date().toISOString()]
            });
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // PUT update news
    if (req.method === 'PUT' && id) {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            const { title, content, images } = JSON.parse(body);
            await client.execute({
                sql: "UPDATE news SET title = ?, content = ?, images = ? WHERE id = ?",
                args: [title, content, JSON.stringify(images || []), id]
            });
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // DELETE news
    if (req.method === 'DELETE' && id) {
        try {
            await client.execute({ sql: "DELETE FROM news WHERE id = ?", args: [id] });
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    res.status(404).json({ error: 'Not found' });
};
