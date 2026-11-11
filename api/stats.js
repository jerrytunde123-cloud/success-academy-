const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await client.execute({
            sql: "SELECT COUNT(*) as count FROM visitors WHERE date = ?",
            args: [today]
        });
        const totalRes = await client.execute("SELECT COUNT(*) as count FROM visitors");
        const pinsRes = await client.execute("SELECT COUNT(*) as count FROM pins");
        res.status(200).json({
            todayVisitors: todayRes.rows[0].count,
            totalVisitors: totalRes.rows[0].count,
            totalPinsSold: pinsRes.rows[0].count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
