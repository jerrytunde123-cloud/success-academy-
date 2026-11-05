const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const Exam = require('./models/Exam');
const Pin = require('./models/Pin');
const Enquiry = require('./models/Enquiry');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jerrytunde123_db_user:<Wjh7YkO58X901Q9p>@cluster.f4jypw9.mongodb.net/';

mongoose.connect(MONGO_URI)
.then(async () => {
    console.log('MongoDB Connected');
    const count = await Exam.countDocuments();
    if (count === 0) {
        const defaultSubjects = ['Maths', 'English', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'Geography', 'Agriculture', 'Further Maths'].map(name => ({ name, content: '', previewImage: '' }));
        await Exam.insertMany([
            { name: 'WAEC', logo: 'waec-logo.png', subjects: defaultSubjects },
            { name: 'WAEC GCE', logo: 'waec-logo.png', subjects: defaultSubjects },
            { name: 'NECO', logo: 'neco-logo.png', subjects: defaultSubjects },
            { name: 'NECO GCE', logo: 'neco-logo.png', subjects: defaultSubjects },
            { name: 'JAMB', logo: 'jamb-logo.png', subjects: defaultSubjects },
            { name: 'POST UTME', logo: 'putme-logo.png', subjects: defaultSubjects },
            { name: 'JUPEB', logo: 'jupeb-logo.png', subjects: defaultSubjects },
            { name: 'IJMB', logo: 'ijmb-logo.png', subjects: defaultSubjects },
            { name: 'NABTEB', logo: 'nabteb-logo.png', subjects: defaultSubjects }
        ]);
        console.log('Database seeded.');
    }
})
.catch(err => console.log('MongoDB Connection Error:', err));

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage });

// --- ROUTES ---
app.get('/api/exams', async (req, res) => {
    try { res.json(await Exam.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try { res.json(await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000';
    res.json({ imageUrl: `${baseUrl}/uploads/${req.file.filename}` });
});

// UPDATED: Generate PIN (Now handles manual PINs from Admin)
app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId, manualPin } = req.body;
        
        // If manualPin is provided by admin, use it. Otherwise generate random.
        const finalPin = manualPin ? manualPin.toUpperCase() : Math.random().toString(36).substr(2, 6).toUpperCase();
        
        const newPin = new Pin({ pin: finalPin, examId, subjects, deviceId });
        await newPin.save();
        res.json({ success: true, pin: finalPin });
    } catch (err) { 
        if(err.code === 11000) return res.status(400).json({ error: 'This PIN already exists.' });
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/pins/verify', async (req, res) => {
    try {
        const { pin, deviceId } = req.body;
        const pinData = await Pin.findOne({ pin: pin }).populate('examId');
        if (!pinData) return res.status(404).json({ error: 'Invalid PIN' });
        if (pinData.deviceId !== deviceId) return res.status(403).json({ error: 'Fraud Alert: Wrong Device' });
        res.json({ success: true, data: pinData });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get All Pins for Admin
app.get('/api/admin/pins', async (req, res) => {
    try { res.json(await Pin.find().populate('examId').sort({ date: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/enquiries', async (req, res) => {
    try { await new Enquiry(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/enquiries', async (req, res) => {
    try { res.json(await Enquiry.find().sort({ date: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
