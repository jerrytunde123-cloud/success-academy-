const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const Exam = require('./models/Exam');
const Pin = require('./models/Pin');
const Enquiry = require('./models/Enquiry'); // Import new model

const app = express();
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
mongoose.connect('mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/success_academy?retryWrites=true&w=majority')
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log(err));

// Multer Config for Image Upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage });

// --- API ROUTES ---

// Exams
app.get('/api/exams', async (req, res) => {
    const exams = await Exam.find();
    res.json(exams);
});

app.put('/api/exams/:id', async (req, res) => {
    const updatedExam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedExam);
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ imageUrl: `http://localhost:5000/uploads/${req.file.filename}` });
});

// PINs
app.post('/api/pins', async (req, res) => {
    const { examId, subjects, deviceId } = req.body;
    const generatedPin = Math.random().toString(36).substr(2, 6).toUpperCase();
    const newPin = new Pin({ pin: generatedPin, examId, subjects, deviceId });
    await newPin.save();
    res.json({ success: true, pin: generatedPin });
});

app.post('/api/pins/verify', async (req, res) => {
    const { pin, deviceId } = req.body;
    const pinData = await Pin.findOne({ pin: pin });
    if (!pinData) return res.status(404).json({ error: 'Invalid PIN' });
    if (pinData.deviceId !== deviceId) return res.status(403).json({ error: 'Fraud Alert: Wrong Device' });
    res.json({ success: true, data: pinData });
});

// --- NEW ENQUIRY ROUTES ---

// 1. Submit a new enquiry (From Frontend)
app.post('/api/enquiries', async (req, res) => {
    try {
        const newEnquiry = new Enquiry(req.body);
        await newEnquiry.save();
        res.json({ success: true, message: 'Enquiry saved' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Get all enquiries (For Admin Dashboard)
app.get('/api/enquiries', async (req, res) => {
    try {
        const enquiries = await Enquiry.find().sort({ date: -1 });
        res.json(enquiries);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
