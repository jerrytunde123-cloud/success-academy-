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
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const { examId, subjects, deviceId, manualPin } = await parseBody(req);

        if (!examId || !deviceId || !Array.isArray(subjects) || subjects.length === 0) {
            json(res, 400, { error: 'examId, deviceId, and subjects are required' });
            return;
        }

        const finalPin = manualPin
            ? String(manualPin).toUpperCase()
            : Math.random().toString(36).substr(2, 6).toUpperCase();

        await client.execute({
            sql: 'INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)',
            args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()]
        });

        json(res, 200, { success: true, pin: finalPin });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
