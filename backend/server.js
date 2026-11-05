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

// ⚠️ PUT YOUR MONGODB CONNECTION STRING HERE ⚠️
const MONGO_URI = 'mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/success_academy?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
.then(async () => {
    console.log('MongoDB Connected');
    // Auto-seed database if empty
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
        console.log('Database seeded with default exams.');
    }
})
.catch(err => console.log(err));

// --- MULTER SETUP (For Image Uploads) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage });

// --- API ROUTES ---

app.get('/api/exams', async (req, res) => {
    try {
        const exams = await Exam.find();
        res.json(exams);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try {
        const updatedExam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedExam);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Return the URL of the uploaded image (Change localhost to your live backend URL when deployed)
    res.json({ imageUrl: `http://localhost:5000/uploads/${req.file.filename}` });
});

app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId } = req.body;
        const generatedPin = Math.random().toString(36).substr(2, 6).toUpperCase();
        const newPin = new Pin({ pin: generatedPin, examId, subjects, deviceId });
        await newPin.save();
        res.json({ success: true, pin: generatedPin });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pins/verify', async (req, res) => {
    try {
        const { pin, deviceId } = req.body;
        const pinData = await Pin.findOne({ pin: pin });
        if (!pinData) return res.status(404).json({ error: 'Invalid PIN' });
        if (pinData.deviceId !== deviceId) return res.status(403).json({ error: 'Fraud Alert: Wrong Device' });
        res.json({ success: true, data: pinData });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ENQUIRY ROUTES ---
app.post('/api/enquiries', async (req, res) => {
    try {
        const newEnquiry = new Enquiry(req.body);
        await newEnquiry.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/enquiries', async (req, res) => {
    try {
        const enquiries = await Enquiry.find().sort({ date: -1 });
        res.json(enquiries);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/enquiries/:id', async (req, res) => {
    try {
        await Enquiry.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
