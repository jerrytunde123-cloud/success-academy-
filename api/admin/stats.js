const { handle, json, method } = require('../../lib/http');
const { ensureSchema } = require('../../lib/schema');
const { requireAdmin } = require('../../lib/auth');
const { query } = require('../../lib/db');

function count(row) {
    return Number((row && (row.count !== undefined ? row.count : row.total)) || 0);
}

module.exports = handle(async function (req, res) {
    if (!method(req, res, ['GET'])) {
        return;
    }

    if (!requireAdmin(req, res)) {
        return;
    }

    await ensureSchema();

    const today = new Date().toISOString().split('T')[0];
    const [
        todayVisitors,
        totalVisitors,
        pins,
        orders,
        enquiries,
        news
    ] = await Promise.all([
        query('SELECT COUNT(*) AS count FROM visitors WHERE date = ?', [today]),
        // Visitors are never deleted, so MAX(id) is the total row count without
        // scanning the whole table every time the admin dashboard is opened.
        query('SELECT COALESCE(MAX(id), 0) AS count FROM visitors'),
        // PINs and orders are never deleted by the app, so MAX(rowid) avoids a
        // full-table scan while still returning the exact total.
        query('SELECT COALESCE(MAX(rowid), 0) AS count FROM pins'),
        query('SELECT COALESCE(MAX(rowid), 0) AS count FROM orders'),
        query('SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN repliedAt IS NULL THEN 1 ELSE 0 END), 0) AS unanswered FROM enquiries'),
        query('SELECT COUNT(*) AS count FROM news')
    ]);

    const paidOrders = await query("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'");
    const pendingOrders = await query("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'");
    const activePins = await query('SELECT COUNT(*) AS count FROM pins WHERE active = 1');
    const revenueRows = await query("SELECT COALESCE(SUM(amount), 0) AS revenue FROM orders WHERE status = 'paid'");

    const totalOrders = count(orders[0]);
    const revenueKobo = Number((revenueRows[0] && revenueRows[0].revenue) || 0);

    json(res, 200, {
        todayVisitors: count(todayVisitors[0]),
        totalVisitors: count(totalVisitors[0]),
        totalPinsSold: count(activePins[0]),
        totalPinsIssued: count(pins[0]),
        activePins: count(activePins[0]),
        totalOrders: totalOrders,
        paidOrders: count(paidOrders[0]),
        pendingOrders: count(pendingOrders[0]),
        failedOrders: Math.max(0, totalOrders - count(paidOrders[0]) - count(pendingOrders[0])),
        revenue: revenueKobo / 100,
        totalEnquiries: count(enquiries[0]),
        unansweredEnquiries: count(enquiries[0]) ? Number(enquiries[0].unanswered || 0) : 0,
        totalNews: count(news[0])
    });
});
