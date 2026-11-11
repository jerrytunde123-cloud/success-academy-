const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

const FULL_SUBJECT_LIST = ['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Economics', 'Commerce', 'Principles of Accounts', 'Literature-in-English', 'Government', 'Geography', 'History', 'Christian Religious Studies', 'Islamic Religious Studies', 'Computer Studies', 'Agricultural Science', 'Hausa', 'Igbo', 'Yoruba', 'French', 'Arabic', 'Home Economics', 'Physical and Health Education', 'Art', 'Music', 'Civic Education'];

async function initDB() {
    await client.execute('CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, name TEXT, slug TEXT, logo TEXT, prices TEXT, allow TEXT, subjects TEXT);');
    await client.execute('CREATE TABLE IF NOT EXISTS pins (pin TEXT PRIMARY KEY, examId TEXT, subjects TEXT, deviceId TEXT, date TEXT);');
    await client.execute('CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT);');
    await client.execute('CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, images TEXT, date TEXT);');
    await client.execute('CREATE TABLE IF NOT EXISTS visitors (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT);');
    const exams = await client.execute('SELECT * FROM exams');
    if (exams.rows.length === 0) {
        const defaultSubjects = JSON.stringify(FULL_SUBJECT_LIST.map(name => ({ name, content: '', thumbnail: '', qaImages: [] })));
        const defaultPrices = JSON.stringify({ per_subject: 1000, per_dept: 5000, all_subjects: 8000 });
        const defaultAllow = JSON.stringify({ per_subject: true, per_dept: true, all_subjects: true });
        const defaults = [
            ['1', 'WAEC', 'waec', 'waec-logo.png'],
            ['2', 'WAEC GCE', 'waecgce', 'waec-logo.png'],
            ['3', 'NECO', 'neco', 'neco-logo.png'],
            ['4', 'NECO GCE', 'necogce', 'neco-logo.png'],
            ['5', 'JAMB', 'jamb', 'jamb-logo.png'],
            ['6', 'POST UTME', 'postutme', 'putme-logo.png'],
            ['7', 'JUPEB', 'jupeb', 'jupeb-logo.png'],
            ['8', 'IJMB', 'ijmb', 'ijmb-logo.png'],
            ['9', 'NABTEB', 'nabteb', 'nabteb-logo.png']
        ];
        for (let i = 0; i < defaults.length; i++) {
            await client.execute({
                sql: 'INSERT INTO exams (id, name, slug, logo, prices, allow, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)',
                args: [defaults[i][0], defaults[i][1], defaults[i][2], defaults[i][3], defaultPrices, defaultAllow, defaultSubjects]
            });
        }
    }
}
initDB();

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
    const id = req.query.id || '';
    const subject = req.query.subject || '';

    if (req.method === 'GET' && !id) {
        try {
            const result = await client.execute('SELECT * FROM exams');
            json(res, 200, result.rows.map(row => ({
                _id: row.id,
                id: row.id,
                name: row.name,
                slug: row.slug,
                logo: row.logo,
                prices: JSON.parse(row.prices || '{}'),
                allow: JSON.parse(row.allow || '{}'),
                subjects: JSON.parse(row.subjects || '[]')
            })));
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id && !subject) {
        try {
            const data = await parseBody(req);
            let updateParts = [];
            let args = [];
            if (data.prices) { updateParts.push('prices = ?'); args.push(JSON.stringify(data.prices)); }
            if (data.allow) { updateParts.push('allow = ?'); args.push(JSON.stringify(data.allow)); }
            if (updateParts.length === 0) {
                json(res, 400, { error: 'Nothing to update' });
                return;
            }
            args.push(id);
            await client.execute({ sql: `UPDATE exams SET ${updateParts.join(', ')} WHERE id = ?`, args: args });
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    if (req.method === 'PUT' && id && subject) {
        try {
            const data = await parseBody(req);
            const examRes = await client.execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [id] });
            if (examRes.rows.length === 0) {
                json(res, 404, { error: 'Exam not found' });
                return;
            }
            const examData = examRes.rows[0];
            let subjects = JSON.parse(examData.subjects || '[]');
            subjects = subjects.map(function(s) {
                const name = typeof s === 'string' ? s : s.name;
                if (name === subject) {
                    if (typeof s === 'string') {
                        return { name: name, content: data.content || '', thumbnail: data.imageUrl || '', qaImages: [] };
                    }
                    return { ...s, content: data.content || '', thumbnail: data.imageUrl || s.thumbnail || '', qaImages: s.qaImages || [] };
                }
                return s;
            });
            await client.execute({
                sql: 'UPDATE exams SET subjects = ? WHERE id = ?',
                args: [JSON.stringify(subjects), id]
            });
            json(res, 200, { success: true });
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
};
