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
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        json(res, 500, { error: 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.' });
        return;
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const TIMEOUT_MS = 30000;

    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await withTimeout(client.execute({
            sql: 'SELECT COUNT(*) as count FROM visitors WHERE date = ?',
            args: [today]
        }), TIMEOUT_MS, 'GET visitors today');
        const totalRes = await withTimeout(client.execute('SELECT COUNT(*) as count FROM visitors'), TIMEOUT_MS, 'GET visitors total');
        const pinsRes = await withTimeout(client.execute('SELECT COUNT(*) as count FROM pins'), TIMEOUT_MS, 'GET pins count');
        json(res, 200, {
            todayVisitors: todayRes.rows[0].count,
            totalVisitors: totalRes.rows[0].count,
            totalPinsSold: pinsRes.rows[0].count
        });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
