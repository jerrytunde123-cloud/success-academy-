const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize Database Tables
async function initDB() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS exams (
            id TEXT PRIMARY KEY,
            name TEXT,
            slug TEXT,
            logo TEXT,
            prices TEXT,
            allow TEXT,
            subjects TEXT
        );
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS pins (
            pin TEXT PRIMARY KEY,
            examId TEXT,
            subjects TEXT,
            deviceId TEXT,
            date TEXT
        );
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS enquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT
        );
    `);

    // Seed default data if empty
    const exams = await db.execute("SELECT * FROM exams");
    if (exams.rows.length === 0) {
        const defaultSubjects = JSON.stringify(['Maths', 'English', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'Geography', 'Agriculture', 'Further Maths'].map(name => ({ name, content: '', thumbnail: '', qaImages: [] })));
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
            ['9', 'NABTEB', 'nabteb', 'nabteb-logo.png'],
        ];
        
        for (let i = 0; i < defaults.length; i++) {
            await db.execute({
                sql: "INSERT INTO exams (id, name, slug, logo, prices, allow, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)",
                args: [defaults[i][0], defaults[i][1], defaults[i][2], defaults[i][3], defaultPrices, defaultAllow, defaultSubjects]
            });
        }
        console.log('Database seeded.');
    }
}
initDB();

// --- ROUTES ---
app.get('/api/exams', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM exams");
        const formatted = result.rows.map(row => ({
            _id: row.id, name: row.name, slug: row.slug, logo: row.logo,
            prices: JSON.parse(row.prices), allow: JSON.parse(row.allow), subjects: JSON.parse(row.subjects)
        }));
        res.json(formatted);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try {
        const { prices, allow, subjects } = req.body;
        const fields = [];
        const args = [];
        
        if (prices) { fields.push("prices = ?"); args.push(JSON.stringify(prices)); }
        if (allow) { fields.push("allow = ?"); args.push(JSON.stringify(allow)); }
        if (subjects) { fields.push("subjects = ?"); args.push(JSON.stringify(subjects)); }
        
        args.push(req.params.id);
        
        await db.execute({
            sql: `UPDATE exams SET ${fields.join(', ')} WHERE id = ?`,
            args: args
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId, manualPin } = req.body;
        const finalPin = manualPin ? manualPin.toUpperCase() : Math.random().toString(36).substr(2, 6).toUpperCase();
        
        await db.execute({
            sql: "INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)",
            args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()]
        });
        res.json({ success: true, pin: finalPin });
    } catch (err) { 
        if(err.message.includes('UNIQUE')) return res.status(400).json({ error: 'This PIN already exists.' });
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/pins/verify', async (req, res) => {
    try {
        const { pin, deviceId } = req.body;
        const pinRes = await db.execute({ sql: "SELECT * FROM pins WHERE pin = ?", args: [pin] });
        
        if (pinRes.rows.length === 0) return res.status(404).json({ error: 'Invalid PIN' });
        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) return res.status(403).json({ error: 'Fraud Alert: Wrong Device' });

        const examRes = await db.execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [pinData.examId] });
        const examData = examRes.rows[0];

        res.json({ 
            success: true, 
            data: {
                pin: pinData.pin,
                subjects: JSON.parse(pinData.subjects),
                examId: {
                    _id: examData.id,
                    name: examData.name,
                    subjects: JSON.parse(examData.subjects)
                }
            } 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/pins', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM pins ORDER BY date DESC");
        const formatted = result.rows.map(row => ({
            pin: row.pin, deviceId: row.deviceId, subjects: JSON.parse(row.subjects), date: row.date,
            examId: { name: row.examId }
        }));
        res.json(formatted);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/enquiries', async (req, res) => {
    try {
        const { name, email, phone, exam, message } = req.body;
        await db.execute({
            sql: "INSERT INTO enquiries (name, email, phone, exam, message, date) VALUES (?, ?, ?, ?, ?, ?)",
            args: [name, email, phone, exam, message, new Date().toISOString()]
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/enquiries', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM enquiries ORDER BY date DESC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
