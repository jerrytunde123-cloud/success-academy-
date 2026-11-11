const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

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
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const { name, email, phone, exam, message } = await parseBody(req);

        if (!name || !email || !message) {
            json(res, 400, { error: 'name, email, and message are required' });
            return;
        }

        await client.execute({
            sql: 'INSERT INTO enquiries (name, email, phone, exam, message, date) VALUES (?, ?, ?, ?, ?, ?)',
            args: [name, email, phone || '', exam || '', message, new Date().toISOString()]
        });

        json(res, 200, { success: true });
    } catch (err) {
        json(res, 500, { error: err.message });
    }
};
