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
    const id = req.query.id || '';
    const subject = req.query.subject || '';

    // Check env vars before doing anything
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        json(res, 500, { error: 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.' });
        return;
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const TIMEOUT_MS = 10000;

    if (req.method === 'GET' && !id) {
        try {
            const result = await withTimeout(client.execute('SELECT * FROM exams'), TIMEOUT_MS, 'GET exams');
            json(res, 200, result.rows.map(row => ({
                _id: row.id,
                id: row.id,
                name: row.name,
                slug: row.slug,
                logo: row.logo,
                prices: JSON.parse(row.prices || '{}'),
                allow: JSON.parse(row.allow || '{}'),
                subjects: JSON.parse(row.subjects || '[]')
            })));
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id && !subject) {
        let body = '';
        for await (const chunk of req) {body += chunk;}
        let data;
        try { data = JSON.parse(body || '{}'); } catch (e) {
            json(res, 400, { error: 'Invalid JSON body' });
            return;
        }

        let updateParts = [];
        let args = [];
        if (data.prices) { updateParts.push('prices = ?'); args.push(JSON.stringify(data.prices)); }
        if (data.allow) { updateParts.push('allow = ?'); args.push(JSON.stringify(data.allow)); }
        if (updateParts.length === 0) {
            json(res, 400, { error: 'Nothing to update' });
            return;
        }
        args.push(id);

        try {
            await withTimeout(client.execute({ sql: `UPDATE exams SET ${updateParts.join(', ')} WHERE id = ?`, args: args }), TIMEOUT_MS, 'PUT exams config');
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id && subject) {
        let body = '';
        for await (const chunk of req) {body += chunk;}
        let data;
        try { data = JSON.parse(body || '{}'); } catch (e) {
            json(res, 400, { error: 'Invalid JSON body' });
            return;
        }

        try {
            const examRes = await withTimeout(client.execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [id] }), TIMEOUT_MS, 'GET exam');
            if (examRes.rows.length === 0) {
                json(res, 404, { error: 'Exam not found' });
                return;
            }
            const examData = examRes.rows[0];
            let subjects = JSON.parse(examData.subjects || '[]');
            subjects = subjects.map(function(s) {
                const name = typeof s === 'string' ? s : s.name;
                if (name === subject) {
                    if (typeof s === 'string') {
                        return { name: name, content: data.content || '', thumbnail: data.imageUrl || '', qaImages: [] };
                    }
                    return { ...s, content: data.content || '', thumbnail: data.imageUrl || s.thumbnail || '', qaImages: s.qaImages || [] };
                }
                return s;
            });
            await withTimeout(client.execute({ sql: 'UPDATE exams SET subjects = ? WHERE id = ?', args: [JSON.stringify(subjects), id] }), TIMEOUT_MS, 'PUT exam subject');
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
};
