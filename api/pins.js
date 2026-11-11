const { getClient, resetClient, withRetry, withTimeout, json } = require('./_db.js');

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
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

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
        await withRetry(() =>
            withTimeout(getClient().execute({
                sql: 'INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)',
                args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()]
            }), TIMEOUT_MS, 'INSERT pin')
        );
        json(res, 200, { success: true, pin: finalPin });
    } catch (err) {
        if (err.message && err.message.includes('EAI_AGAIN')) {
            resetClient();
            json(res, 503, { error: 'Database DNS resolution failed. Check TURSO_DATABASE_URL is correct and your Turso database is active.' });
        } else {
            json(res, 500, { error: err.message });
        }
    }
};
