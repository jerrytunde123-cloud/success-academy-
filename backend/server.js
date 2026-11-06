const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Exam = require('./models/Exam');
const Pin = require('./models/Pin');
const Enquiry = require('./models/Enquiry');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for Base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jerrytunde123_db_user:<Wjh7YkO58X901Q9p>@cluster.f4jypw9.mongodb.net/';

mongoose.connect(MONGO_URI)
.then(async () => {
    console.log('MongoDB Connected');
    const count = await Exam.countDocuments();
    if (count === 0) {
        const defaultSubjects = ['Maths', 'English', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'Geography', 'Agriculture', 'Further Maths'].map(name => ({ name, content: '', thumbnail: '', qaImages: [] }));
        await Exam.insertMany([
            { name: 'WAEC', slug: 'waec', logo: 'waec-logo.png', subjects: defaultSubjects },
            { name: 'WAEC GCE', slug: 'waecgce', logo: 'waec-logo.png', subjects: defaultSubjects },
            { name: 'NECO', slug: 'neco', logo: 'neco-logo.png', subjects: defaultSubjects },
            { name: 'NECO GCE', slug: 'necogce', logo: 'neco-logo.png', subjects: defaultSubjects },
            { name: 'JAMB', slug: 'jamb', logo: 'jamb-logo.png', subjects: defaultSubjects },
            { name: 'POST UTME', slug: 'postutme', logo: 'putme-logo.png', subjects: defaultSubjects },
            { name: 'JUPEB', slug: 'jupeb', logo: 'jupeb-logo.png', subjects: defaultSubjects },
            { name: 'IJMB', slug: 'ijmb', logo: 'ijmb-logo.png', subjects: defaultSubjects },
            { name: 'NABTEB', slug: 'nabteb', logo: 'nabteb-logo.png', subjects: defaultSubjects }
        ]);
        console.log('Database seeded.');
    }
})
.catch(err => console.log('MongoDB Connection Error:', err));

// --- ROUTES ---
app.get('/api/exams', async (req, res) => {
    try { res.json(await Exam.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try { res.json(await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pins', async (req, res) => {
    try {
        const { examId, subjects, deviceId, manualPin } = req.body;
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
