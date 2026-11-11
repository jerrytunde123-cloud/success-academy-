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

    const { pin, deviceId } = parsed;

    if (!pin || !deviceId) {
        json(res, 400, { error: 'PIN and deviceId are required' });
        return;
    }

    try {
        const pinRes = await withRetry(() =>
            withTimeout(getClient().execute({ sql: 'SELECT * FROM pins WHERE pin = ?', args: [pin.toUpperCase()] }), TIMEOUT_MS, 'GET pin')
        );
        if (pinRes.rows.length === 0) {
            json(res, 404, { error: 'Invalid PIN' });
            return;
        }

        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) {
            json(res, 403, { error: 'Fraud Alert: This PIN was purchased on a different device!' });
            return;
        }

        const examRes = await withRetry(() =>
            withTimeout(getClient().execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [pinData.examId] }), TIMEOUT_MS, 'GET exam')
        );
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
        console.error("[API] verify:", err.message);
        if (err.message && err.message.includes('EAI_AGAIN')) {
            resetClient();
            json(res, 503, { error: 'Database DNS resolution failed. Check TURSO_DATABASE_URL is correct and your Turso database is active.' });
        } else {
            json(res, 500, { error: err.message });
        }
    }
};
