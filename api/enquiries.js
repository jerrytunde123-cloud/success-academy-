const { getConn, withRetry, withTimeout, json } = require('./_db.js');

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

module.exports = async (req, res) => {
    const TIMEOUT_MS = 30000;
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch (e) {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { name, email, phone, exam, message } = parsed;

    if (!name || !email || !message) {
        json(res, 400, { error: 'name, email, and message are required' });
        return;
    }

    try {
        await withRetry(() =>
            withTimeout(async () => {
                const conn = getConn();
                const stmt = await conn.prepare("INSERT INTO enquiries (name, email, phone, exam, message, date) VALUES (?, ?, ?, ?, ?, ?)");
                return await stmt.run(name, email, phone || '', exam || '', message, new Date().toISOString());
            }, TIMEOUT_MS, 'INSERT enquiry')
        );
        json(res, 200, { success: true });
    } catch (err) {
        console.error('[enquiries] ERROR:', err.message);
        json(res, 500, { error: err.message });
    }
};
