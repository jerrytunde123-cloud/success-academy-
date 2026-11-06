const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
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
        content: String,       // Text Answers
        thumbnail: String,     // Base64 Image
        qaImages: [String]     // Array of Base64 Images
    }]
});

module.exports = mongoose.model('Exam', examSchema);
