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

    const { pin, deviceId } = parsed;

    if (!pin || !deviceId) {
        json(res, 400, { error: 'PIN and deviceId are required' });
        return;
    }

    try {
        const pinRes = await withTimeout(client.execute({ sql: 'SELECT * FROM pins WHERE pin = ?', args: [pin.toUpperCase()] }), TIMEOUT_MS, 'GET pin');
        if (pinRes.rows.length === 0) {
            json(res, 404, { error: 'Invalid PIN' });
            return;
        }

        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) {
            json(res, 403, { error: 'Fraud Alert: This PIN was purchased on a different device!' });
            return;
        }

        const examRes = await withTimeout(client.execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [pinData.examId] }), TIMEOUT_MS, 'GET exam');
        if (examRes.rows.length === 0) {
            json(res, 404, { error: 'Exam not found' });
            return;
        }

        const examData = examRes.rows[0];
        json(res, 200, {
            success: true,
            data: {
                pin: pinData.pin,
                subjects: JSON.parse(pinData.subjects || '[]'),
                examId: {
                    _id: examData.id,
                    id: examData.id,
                    name: examData.name,
                    subjects: JSON.parse(examData.subjects || '[]')
                }
            }
        });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
