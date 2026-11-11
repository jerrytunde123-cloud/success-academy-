const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { pin, deviceId } = JSON.parse(body);

        const pinRes = await client.execute({ sql: "SELECT * FROM pins WHERE pin = ?", args: [pin] });
        if (pinRes.rows.length === 0) {
            res.status(404).json({ error: 'Invalid PIN' });
            return;
        }

        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) {
            res.status(403).json({ error: 'Fraud Alert: This PIN was purchased on a different device!' });
            return;
        }

        const examRes = await client.execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [pinData.examId] });
        if (examRes.rows.length === 0) {
            res.status(404).json({ error: 'Exam not found' });
            return;
        }

        const examData = examRes.rows[0];
        res.status(200).json({
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
        res.status(500).json({ error: err.message });
    }
};
