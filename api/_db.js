// =========================
// SUCCESS ACADEMY - Database Helper (Vercel Serverless)
// Docs: https://docs.turso.tech/integrations/vercel
// Uses @libsql/client/web for serverless compatibility
// =========================

const { createClient } = require('@libsql/client/web');

let clientError = null;

function getClient() {
    if (clientError) {
        throw new Error(clientError);
    }
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        clientError = 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel environment variables.';
        console.error('[DB] ' + clientError);
        throw new Error(clientError);
    }
    try {
        return createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });
    } catch (err) {
        clientError = 'Failed to create Turso client: ' + err.message;
        console.error('[DB] ' + clientError);
        throw new Error(clientError);
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
                err.message.includes('fetch failed')
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

async function withTimeout(promise, ms, label) {
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

module.exports = { getClient, withRetry, withTimeout, json };
