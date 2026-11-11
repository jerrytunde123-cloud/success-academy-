module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { password } = JSON.parse(body);

        if (password === process.env.ADMIN_PASSWORD) {
            res.status(200).json({ ok: true });
        } else {
            res.status(401).json({ ok: false, error: 'Invalid password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
