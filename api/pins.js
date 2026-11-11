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
    const TIMEOUT_MS = 30000;

    let body = '';
    for await (const chunk of req) {body += chunk;}
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch (e) {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { examId, subjects, deviceId, manualPin } = parsed;

    if (!examId || !deviceId || !Array.isArray(subjects) || subjects.length === 0) {
        json(res, 400, { error: 'examId, deviceId, and subjects are required' });
        return;
    }

    const finalPin = manualPin
        ? String(manualPin).toUpperCase()
        : Math.random().toString(36).substr(2, 6).toUpperCase();

    try {
        await withTimeout(client.execute({
            sql: 'INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)',
            args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()]
        }), TIMEOUT_MS, 'INSERT pin');
        json(res, 200, { success: true, pin: finalPin });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
