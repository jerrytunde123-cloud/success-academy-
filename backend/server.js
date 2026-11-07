const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FULL_SUBJECT_LIST = ["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Commerce", "Principles of Accounts", "Literature-in-English", "Government", "Geography", "History", "Christian Religious Studies", "Islamic Religious Studies", "Computer Studies", "Agricultural Science", "Hausa", "Igbo", "Yoruba", "French", "Arabic", "Home Economics", "Physical and Health Education", "Art", "Music", "Civic Education"];

async function initDB() {
    await db.execute(`CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, name TEXT, slug TEXT, logo TEXT, prices TEXT, allow TEXT, subjects TEXT);`);
    await db.execute(`CREATE TABLE IF NOT EXISTS pins (pin TEXT PRIMARY KEY, examId TEXT, subjects TEXT, deviceId TEXT, date TEXT);`);
    await db.execute(`CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT);`);
    
    // ⚠️ FIX: Drop the old news table to recreate it with the imageUrl column
    await db.execute(`DROP TABLE IF EXISTS news;`);
    await db.execute(`CREATE TABLE news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, imageUrl TEXT, date TEXT);`);
    
    await db.execute(`CREATE TABLE IF NOT EXISTS visitors (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT);`);
    
    const exams = await db.execute("SELECT * FROM exams");
    if (exams.rows.length === 0) {
        const defaultSubjects = JSON.stringify(FULL_SUBJECT_LIST.map(name => ({ name, content: '', thumbnail: '', qaImages: [] })));
        const defaultPrices = JSON.stringify({ per_subject: 1000, per_dept: 5000, all_subjects: 8000 });
        const defaultAllow = JSON.stringify({ per_subject: true, per_dept: true, all_subjects: true });
        const defaults = [['1', 'WAEC', 'waec', 'waec-logo.png'], ['2', 'WAEC GCE', 'waecgce', 'waec-logo.png'], ['3', 'NECO', 'neco', 'neco-logo.png'], ['4', 'NECO GCE', 'necogce', 'neco-logo.png'], ['5', 'JAMB', 'jamb', 'jamb-logo.png'], ['6', 'POST UTME', 'postutme', 'putme-logo.png'], ['7', 'JUPEB', 'jupeb', 'jupeb-logo.png'], ['8', 'IJMB', 'ijmb', 'ijmb-logo.png'], ['9', 'NABTEB', 'nabteb', 'nabteb-logo.png']];
        for (let i = 0; i < defaults.length; i++) {
            await db.execute({ sql: "INSERT INTO exams (id, name, slug, logo, prices, allow, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [defaults[i][0], defaults[i][1], defaults[i][2], defaults[i][3], defaultPrices, defaultAllow, defaultSubjects] });
        }
    }
}
initDB();

app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const fileExtension = req.file.originalname.split('.').pop();
        const fileName = `uploads/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExtension}`;
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        });
        await s3.send(command);
        res.json({ imageUrl: `${process.env.R2_PUBLIC_URL}/${fileName}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/exams', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM exams");
        res.json(result.rows.map(row => ({ _id: row.id, name: row.name, slug: row.slug, logo: row.logo, prices: JSON.parse(row.prices), allow: JSON.parse(row.allow), subjects: JSON.parse(row.subjects) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try {
        const { prices, allow, subjects } = req.body;
        let updateParts = []; let args = [];
        if (prices) { updateParts.push("prices = ?"); args.push(JSON.stringify(prices)); }
        if (allow) { updateParts.push("allow = ?"); args.push(JSON.stringify(allow)); }
        if (subjects) { updateParts.push("subjects = ?"); args.push(JSON.stringify(subjects)); }
        args.push(req.params.id);
        await db.execute({ sql: `UPDATE exams SET ${updateParts.join(', ')} WHERE id = ?`, args: args });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId, manualPin } = req.body;
        const finalPin = manualPin ? manualPin.toUpperCase() : Math.random().toString(36).substr(2, 6).toUpperCase();
        await db.execute({ sql: "INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)", args: [finalPin, examId, JSON.stringify(subjects), deviceId, new Date().toISOString()] });
        res.json({ success: true, pin: finalPin });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pins/verify', async (req, res) => {
    try {
        const { pin, deviceId } = req.body;
        const pinRes = await db.execute({ sql: "SELECT * FROM pins WHERE pin = ?", args: [pin] });
        if (pinRes.rows.length === 0) return res.status(404).json({ error: 'Invalid PIN' });
        const pinData = pinRes.rows[0];
        if (pinData.deviceId !== deviceId) return res.status(403).json({ error: 'Fraud Alert' });
        const examRes = await db.execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [pinData.examId] });
        const examData = examRes.rows[0];
        res.json({ success: true, data: { pin: pinData.pin, subjects: JSON.parse(pinData.subjects), examId: { _id: examData.id, name: examData.name, subjects: JSON.parse(examData.subjects) } } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/pins', async (req, res) => {
    try {
        const result = await db.execute(`SELECT pins.*, exams.name as examName FROM pins LEFT JOIN exams ON pins.examId = exams.id ORDER BY pins.date DESC`);
        res.json(result.rows.map(row => ({ pin: row.pin, deviceId: row.deviceId, subjects: JSON.parse(row.subjects), date: row.date, examId: { name: row.examName || 'Deleted Exam' } })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/enquiries', async (req, res) => {
    try {
        const { name, email, phone, exam, message } = req.body;
        await db.execute({ sql: "INSERT INTO enquiries (name, email, phone, exam, message, date) VALUES (?, ?, ?, ?, ?, ?)", args: [name, email, phone, exam, message, new Date().toISOString()] });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/enquiries', async (req, res) => {
    try { const result = await db.execute("SELECT * FROM enquiries ORDER BY date DESC"); res.json(result.rows); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/visitors', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        await db.execute({ sql: "INSERT INTO visitors (date) VALUES (?)", args: [today] });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await db.execute({ sql: "SELECT COUNT(*) as count FROM visitors WHERE date = ?", args: [today] });
        const totalRes = await db.execute("SELECT COUNT(*) as count FROM visitors");
        const pinsRes = await db.execute("SELECT COUNT(*) as count FROM pins");
        res.json({ todayVisitors: todayRes.rows[0].count, totalVisitors: totalRes.rows[0].count, totalPinsSold: pinsRes.rows[0].count });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- NEWS ROUTES ---
app.post('/api/admin/news', async (req, res) => {
    try {
        const { title, content, imageUrl } = req.body;
        await db.execute({ sql: "INSERT INTO news (title, content, imageUrl, date) VALUES (?, ?, ?, ?)", args: [title, content, imageUrl || '', new Date().toISOString()] });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ⚠️ NEW: Edit/Update News Route
app.put('/api/admin/news/:id', async (req, res) => {
    try {
        const { title, content, imageUrl } = req.body;
        await db.execute({ sql: "UPDATE news SET title = ?, content = ?, imageUrl = ? WHERE id = ?", args: [title, content, imageUrl || '', req.params.id] });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/news', async (req, res) => {
    try { const result = await db.execute("SELECT * FROM news ORDER BY date DESC"); res.json(result.rows); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/news/:id', async (req, res) => {
    try { await db.execute({ sql: "DELETE FROM news WHERE id = ?", args: [req.params.id] }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
