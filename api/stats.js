const { getConn, withRetry, withTimeout, json } = require('./_db.js');

module.exports = async (req, res) => {
    const TIMEOUT_MS = 30000;
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await withRetry(() =>
            withTimeout(async () => {
                const conn = getConn();
                const stmt = await conn.prepare("SELECT COUNT(*) as count FROM visitors WHERE date = ?");
                return await stmt.all(today);
            }, TIMEOUT_MS, 'GET visitors today')
        );
        const totalRes = await withRetry(() =>
            withTimeout(async () => {
                const conn = getConn();
                const stmt = await conn.prepare("SELECT COUNT(*) as count FROM visitors");
                return await stmt.all();
            }, TIMEOUT_MS, 'GET visitors total')
        );
        const pinsRes = await withRetry(() =>
            withTimeout(async () => {
                const conn = getConn();
                const stmt = await conn.prepare("SELECT COUNT(*) as count FROM pins");
                return await stmt.all();
            }, TIMEOUT_MS, 'GET pins count')
        );
        json(res, 200, {
            todayVisitors: todayRes[0].count,
            totalVisitors: totalRes[0].count,
            totalPinsSold: pinsRes[0].count
        });
    } catch (err) {
        console.error('[stats] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
