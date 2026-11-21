const { handle, json } = require('../../lib/http');

const routes = {
    catalog: require('../../lib/handlers/result-pins/catalog'),
    checkout: require('../../lib/handlers/result-pins/checkout'),
    claim: require('../../lib/handlers/result-pins/claim'),
    voucher: require('../../lib/handlers/result-pins/voucher'),
    emailjs: require('../../lib/handlers/result-pins/emailjs'),
    emailed: require('../../lib/handlers/result-pins/emailed')
};

function getSegment(req) {
    if (req.query && req.query.route) {
        const value = req.query.route;
        return Array.isArray(value) ? value[0] : String(value).split('/')[0];
    }
    try {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const match = pathname.match(/^\/api\/result-pins\/([^/]+)/);
        return match ? match[1] : '';
    } catch (_err) {
        return '';
    }
}

module.exports = handle(async function (req, res) {
    const segment = getSegment(req);
    const handler = routes[segment];
    if (!handler) {
        json(res, 404, { error: 'Not found' });
        return;
    }
    return handler(req, res);
});
