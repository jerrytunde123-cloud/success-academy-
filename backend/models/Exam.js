const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    name: { type: String, required: true },
    logo: { type: String },
    prices: {
        per_subject: { type: Number, default: 1000 },
        per_dept: { type: Number, default: 5000 },
        all_subjects: { type: Number, default: 8000 }
    },
    allow: {
        per_subject: { type: Boolean, default: true },
        per_dept: { type: Boolean, default: true },
        all_subjects: { type: Boolean, default: true }
    },
    subjects: [{
        name: String,
        content: String,
        previewImage: String
    }]
});

module.exports = mongoose.model('Exam', examSchema);
