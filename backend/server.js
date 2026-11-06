const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();

// FIX 1: Allow Vercel to talk to Render without CORS errors
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' })); 

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

app.get('/api/ping', (req, res) => {
    res.json({ status: "awake" });
});

// FIX 2: Catch errors so the server doesn't crash
async function initDB() {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, name TEXT, slug TEXT, logo TEXT, prices TEXT, allow TEXT, subjects TEXT);`);
        await db.execute(`CREATE TABLE IF NOT EXISTS pins (pin TEXT PRIMARY KEY, examId TEXT, subjects TEXT, deviceId TEXT, date TEXT);`);
        await db.execute(`CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT);`);
        console.log("Tables ready.");
    } catch (err) {
        console.error("DATABASE INIT ERROR:", err.message);
    }
}
initDB();

// --- ROUTES ---
app.get('/api/exams', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM exams");
        const formatted = result.rows.map(row => ({
            _id: String(row.id), name: row.name, slug: row.slug, logo: row.logo,
            prices: JSON.parse(row.prices), allow: JSON.parse(row.allow), subjects: JSON.parse(row.subjects)
        }));
        res.json(formatted);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
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
        await db.execute({ sql: `UPDATE exams SET ${fields.join(', ')} WHERE id = ?`, args: args });
        res.json({ success: true });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId, manualPin } = req.body;
        const finalPin = manualPin ? manualPin.toUpperCase() : Math.random().toString(36).substr(2, 6).toUpperCase();
        await db.execute({
            sql: "INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)",
            args: [finalPin, String(examId), JSON.stringify(subjects), deviceId, new Date().toISOString()]
        });
        res.json({ success: true, pin: finalPin });
    } catch (err) { 
        console.error(err);
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

        const examRes = await db.execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [String(pinData.examId)] });
        if (examRes.rows.length === 0) return res.status(404).json({ error: 'Exam deleted.' });
        
        const examData = examRes.rows[0];
        res.json({ 
            success: true, 
            data: {
                pin: pinData.pin,
                subjects: JSON.parse(pinData.subjects),
                examId: { _id: String(examData.id), name: examData.name, subjects: JSON.parse(examData.subjects) }
            } 
        });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/admin/pins', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM pins ORDER BY date DESC");
        const formatted = result.rows.map(row => ({
            pin: row.pin, deviceId: row.deviceId, subjects: JSON.parse(row.subjects), date: row.date,
            examId: { name: row.examId }
        }));
        res.json(formatted);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
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
