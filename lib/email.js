const { HttpError } = require('./http');

function isEmailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendReplyEmail(input) {
    if (!isEmailConfigured()) {
        throw new HttpError(503, 'Email replies are not configured. Add RESEND_API_KEY and EMAIL_FROM, or reply through WhatsApp.');
    }

    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, 10000);

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: process.env.EMAIL_FROM,
                to: [input.to],
                subject: 'Re: Your enquiry to Success Academy',
                text: 'Hello ' + input.name + ',\n\n' + input.message + '\n\n— Success Academy'
            }),
            signal: controller.signal
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_err) {
            data = {};
        }

        if (!response.ok) {
            throw new HttpError(502, data.message || 'The email could not be sent.');
        }

        return data;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new HttpError(504, 'The email service timed out. Please try again.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { isEmailConfigured, sendReplyEmail };
