const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

const FULL_SUBJECT_LIST = ["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Commerce", "Principles of Accounts", "Literature-in-English", "Government", "Geography", "History", "Christian Religious Studies", "Islamic Religious Studies", "Computer Studies", "Agricultural Science", "Hausa", "Igbo", "Yoruba", "French", "Arabic", "Home Economics", "Physical and Health Education", "Art", "Music", "Civic Education"];

async function initDB() {
    await client.execute(`CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, name TEXT, slug TEXT, logo TEXT, prices TEXT, allow TEXT, subjects TEXT);`);
    await client.execute(`CREATE TABLE IF NOT EXISTS pins (pin TEXT PRIMARY KEY, examId TEXT, subjects TEXT, deviceId TEXT, date TEXT);`);
    await client.execute(`CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT);`);
    await client.execute(`CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, images TEXT, date TEXT);`);
    await client.execute(`CREATE TABLE IF NOT EXISTS visitors (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT);`);
    const exams = await client.execute("SELECT * FROM exams");
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
                sql: "INSERT INTO exams (id, name, slug, logo, prices, allow, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)",
                args: [defaults[i][0], defaults[i][1], defaults[i][2], defaults[i][3], defaultPrices, defaultAllow, defaultSubjects]
            });
        }
    }
}
initDB();

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const id = req.query.id || '';

    // GET list of all exams
    if (req.method === 'GET' && !id) {
        try {
            const result = await client.execute("SELECT * FROM exams");
            res.status(200).json(result.rows.map(row => ({
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
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // PUT update exam config (prices + allow)
    if (req.method === 'PUT' && id && !req.query.subject) {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            const data = JSON.parse(body);
            let updateParts = [];
            let args = [];
            if (data.prices) { updateParts.push("prices = ?"); args.push(JSON.stringify(data.prices)); }
            if (data.allow) { updateParts.push("allow = ?"); args.push(JSON.stringify(data.allow)); }
            if (updateParts.length === 0) {
                res.status(400).json({ error: 'Nothing to update' });
                return;
            }
            args.push(id);
            await client.execute({ sql: `UPDATE exams SET ${updateParts.join(', ')} WHERE id = ?`, args: args });
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // PUT update a single subject's content + image
    if (req.method === 'PUT' && id && req.query.subject) {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            const { subject, content, imageUrl } = JSON.parse(body);

            const examRes = await client.execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [id] });
            if (examRes.rows.length === 0) {
                res.status(404).json({ error: 'Exam not found' });
                return;
            }
            const examData = examRes.rows[0];
            let subjects = JSON.parse(examData.subjects || '[]');

            subjects = subjects.map(function(s) {
                const name = typeof s === 'string' ? s : s.name;
                if (name === subject) {
                    if (typeof s === 'string') {
                        return { name: name, content: content || '', thumbnail: imageUrl || '', qaImages: [] };
                    }
                    return { ...s, content: content || '', thumbnail: imageUrl || s.thumbnail || '', qaImages: s.qaImages || [] };
                }
                return s;
            });

            await client.execute({
                sql: "UPDATE exams SET subjects = ? WHERE id = ?",
                args: [JSON.stringify(subjects), id]
            });
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
        return;
    }

    res.status(404).json({ error: 'Not found' });
};
