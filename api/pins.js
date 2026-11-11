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
        const { examId, subjects, deviceId, manualPin } = JSON.parse(body);

        const finalPin = manualPin
            ? manualPin.toUpperCase()
            : Math.random().toString(36).substr(2, 6).toUpperCase();

        await client.execute({
            sql: "INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)",
            args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()]
        });

        res.status(200).json({ success: true, pin: finalPin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
