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
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        json(res, 500, { error: 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.' });
        return;
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const TIMEOUT_MS = 10000;

    let body = '';
    for await (const chunk of req) {body += chunk;}
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch (e) {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { name, email, phone, exam, message } = parsed;

    if (!name || !email || !message) {
        json(res, 400, { error: 'name, email, and message are required' });
        return;
    }

    try {
        await withTimeout(client.execute({
            sql: 'INSERT INTO enquiries (name, email, phone, exam, message, date) VALUES (?, ?, ?, ?, ?, ?)',
            args: [name, email, phone || '', exam || '', message, new Date().toISOString()]
        }), TIMEOUT_MS, 'INSERT enquiry');
        json(res, 200, { success: true });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
