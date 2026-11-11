const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await client.execute({
            sql: 'SELECT COUNT(*) as count FROM visitors WHERE date = ?',
            args: [today]
        });
        const totalRes = await client.execute('SELECT COUNT(*) as count FROM visitors');
        const pinsRes = await client.execute('SELECT COUNT(*) as count FROM pins');
        json(res, 200, {
            todayVisitors: todayRes.rows[0].count,
            totalVisitors: totalRes.rows[0].count,
            totalPinsSold: pinsRes.rows[0].count
        });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
