function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    json(res, 200, { ok: true, service: 'success-academy-api', time: new Date().toISOString() });
};
