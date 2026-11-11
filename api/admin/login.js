function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    if (!process.env.ADMIN_PASSWORD) {
        json(res, 500, { ok: false, error: 'Admin password not configured' });
        return;
    }

    let body = '';
    for await (const chunk of req) {body += chunk;}
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch (e) {
        json(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
    }

    const { password } = parsed;

    if (!password || typeof password !== 'string') {
        json(res, 400, { ok: false, error: 'Password is required' });
        return;
    }

    if (password === process.env.ADMIN_PASSWORD) {
        json(res, 200, { ok: true });
    } else {
        json(res, 401, { ok: false, error: 'Invalid password' });
    }
};
