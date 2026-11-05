const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
    pin: { type: String, required: true, unique: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    subjects: [String],
    deviceId: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pin', pinSchema);
