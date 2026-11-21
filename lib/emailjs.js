// EmailJS configuration for the admin dashboard.
//
// The EmailJS browser SDK must run client-side, so its public key and IDs end
// up in the browser. They are kept in environment variables (never hardcoded)
// and are exposed only to signed-in admins by /api/admin/emailjs.
// No EmailJS private key is used or exposed: browser sending relies on the
// public key, and the SDK's own rate limit keeps requests within EmailJS limits.

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

// Buyer receipts use a separate EmailJS template. Its identifiers are public
// too, but they are served from /api/result-pins/emailjs rather than the
// admin-only endpoint so the reply template is never mixed with receipts.
function isResultEmailJSConfigured() {
    return isEmailJSConfigured() && Boolean(envValue('EMAILJS_RESULT_TEMPLATE_ID'));
}

function getResultEmailJSConfig() {
    if (!isResultEmailJSConfigured()) {
        return { enabled: false, publicKey: '', serviceId: '', templateId: '' };
    }
    return {
        enabled: true,
        publicKey: envValue('EMAILJS_PUBLIC_KEY'),
        serviceId: envValue('EMAILJS_SERVICE_ID'),
        templateId: envValue('EMAILJS_RESULT_TEMPLATE_ID')
    };
}

module.exports = {
    isEmailJSConfigured,
    getEmailJSPublicConfig,
    isResultEmailJSConfigured,
    getResultEmailJSConfig
};
