function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = async (req, res) => {
    console.log('[admin/login]', req.method, req.url);
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const { password } = await parseBody(req);
        console.log('[admin/login] password provided:', !!password);

        if (!password || typeof password !== 'string') {
            json(res, 400, { ok: false, error: 'Password is required' });
            return;
        }

        if (!process.env.ADMIN_PASSWORD) {
            console.log('[admin/login] ADMIN_PASSWORD not set');
            json(res, 500, { ok: false, error: 'Admin password not configured' });
            return;
        }

        if (password === process.env.ADMIN_PASSWORD) {
            json(res, 200, { ok: true });
        } else {
            json(res, 401, { ok: false, error: 'Invalid password' });
        }
    } catch (err) {
        console.error('[admin/login] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
