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
        const { pin, deviceId } = await parseBody(req);

        if (!pin || !deviceId) {
            json(res, 400, { error: 'PIN and deviceId are required' });
            return;
        }

        const pinRes = await client.execute({ sql: 'SELECT * FROM pins WHERE pin = ?', args: [pin.toUpperCase()] });
        if (pinRes.rows.length === 0) {
            json(res, 404, { error: 'Invalid PIN' });
            return;
        }

        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) {
            json(res, 403, { error: 'Fraud Alert: This PIN was purchased on a different device!' });
            return;
        }

        const examRes = await client.execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [pinData.examId] });
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
