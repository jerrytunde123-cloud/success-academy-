const { getClient, withRetry, withTimeout, json } = require('./_db.js');

module.exports = async (req, res) => {
    const TIMEOUT_MS = 30000;
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await withRetry(() =>
            withTimeout(getClient().execute({
                sql: "SELECT COUNT(*) as count FROM visitors WHERE date = ?",
                args: [today]
            }), TIMEOUT_MS, 'GET visitors today')
        );
        const totalRes = await withRetry(() =>
            withTimeout(getClient().execute("SELECT COUNT(*) as count FROM visitors"), TIMEOUT_MS, 'GET visitors total')
        );
        const pinsRes = await withRetry(() =>
            withTimeout(getClient().execute("SELECT COUNT(*) as count FROM pins"), TIMEOUT_MS, 'GET pins count')
        );
        json(res, 200, {
            todayVisitors: todayRes.rows[0].count,
            totalVisitors: totalRes.rows[0].count,
            totalPinsSold: pinsRes.rows[0].count
        });
    } catch (err) {
        console.error('[stats] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
