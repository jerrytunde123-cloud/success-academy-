const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    exam: String,
    message: String,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Enquiry', enquirySchema);
