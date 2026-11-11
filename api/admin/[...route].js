const { handle, json } = require('../../lib/http');

const routes = {
    enquiries: require('../../lib/handlers/admin/enquiries'),
    exams: require('../../lib/handlers/admin/exams'),
    login: require('../../lib/handlers/admin/login'),
    logout: require('../../lib/handlers/admin/logout'),
    news: require('../../lib/handlers/admin/news'),
    pins: require('../../lib/handlers/admin/pins'),
    session: require('../../lib/handlers/admin/session'),
    stats: require('../../lib/handlers/admin/stats'),
    subjects: require('../../lib/handlers/admin/subjects'),
    upload: require('../../lib/handlers/admin/upload')
};

function getSegment(req) {
    if (req.query && req.query.route) {
        const value = req.query.route;
        return Array.isArray(value) ? value[0] : String(value).split('/')[0];
    }
    try {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const match = pathname.match(/^\/api\/admin\/([^/]+)/);
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
