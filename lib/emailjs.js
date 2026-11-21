// Shared EmailJS configuration.
//
// One EmailJS template is used everywhere in the app. The browser sends two
// template variables: {{to_email}} for the recipient and {{{html}}} for the
// full message body. Triple braces let EmailJS insert raw HTML; the browser
// escapes every dynamic value before sending it.
//
// The SDK must run client-side, so the public key and IDs end up in the
// browser. They are kept in environment variables (never hardcoded) and are
// served by /api/admin/emailjs and /api/result-pins/emailjs. No private key is
// used or exposed.

function envValue(name) {
    return String(process.env[name] || '').trim();
}

function isEmailJSConfigured() {
    return Boolean(
        envValue('EMAILJS_PUBLIC_KEY') &&
        envValue('EMAILJS_SERVICE_ID') &&
        envValue('EMAILJS_TEMPLATE_ID')
    );
}

function getEmailJSPublicConfig() {
    if (!isEmailJSConfigured()) {
        return { enabled: false, publicKey: '', serviceId: '', templateId: '' };
    }

    return {
        enabled: true,
        publicKey: envValue('EMAILJS_PUBLIC_KEY'),
        serviceId: envValue('EMAILJS_SERVICE_ID'),
        templateId: envValue('EMAILJS_TEMPLATE_ID')
    };
}

module.exports = {
    isEmailJSConfigured,
    getEmailJSPublicConfig
};
