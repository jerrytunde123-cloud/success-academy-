const { handle, json } = require('../../lib/http');

const routes = {
    claim: require('../../lib/handlers/pins/claim'),
    verify: require('../../lib/handlers/pins/verify')
};

function getSegment(req) {
    if (req.query && req.query.route) {
        const value = req.query.route;
        return Array.isArray(value) ? value[0] : String(value).split('/')[0];
    }
    try {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const match = pathname.match(/^\/api\/pins\/([^/]+)/);
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
