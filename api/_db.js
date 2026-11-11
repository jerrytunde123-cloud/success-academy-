// =========================
// SUCCESS ACADEMY - Database Helper (Vercel Serverless)
// Uses @tursodatabase/serverless — designed for Vercel serverless functions
// Docs: https://docs.turso.tech/integrations/vercel
// =========================

const { connect } = require('@tursodatabase/serverless');

let connError = null;

function getConn() {
    if (connError) {
        throw new Error(connError);
    }
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        connError = 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel environment variables.';
        console.error('[DB] ' + connError);
        throw new Error(connError);
    }
    try {
        return connect({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });
    } catch (err) {
        connError = 'Failed to create Turso connection: ' + err.message;
        console.error('[DB] ' + connError);
        throw new Error(connError);
    }
}

async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isConnectionError = err.message && (
                err.message.includes('ECONNRESET') ||
                err.message.includes('EAI_AGAIN') ||
                err.message.includes('socket hang up') ||
                err.message.includes('fetch failed') ||
                err.message.includes('stream has expired')
            );
            if (isConnectionError && i < maxRetries - 1) {
                console.error('[DB] Connection error (attempt', i + 1, '/', maxRetries, '):', err.message, '- retrying in', delayMs * (i + 1), 'ms...');
                await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

async function withTimeout(fn, ms, label) {
    // fn is an async function — call it, then race with timeout
    const promise = fn();
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);
}

function json(res, status, data) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
}

module.exports = { getConn, withRetry, withTimeout, json };
