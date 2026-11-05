const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    exam: String,
    message: String,
    date: { type: Date, default: Date.now },
    replied: { type: Boolean, default: false }
});

module.exports = mongoose.model('Enquiry', enquirySchema);
