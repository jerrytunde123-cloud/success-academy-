// =========================
// SUCCESS ACADEMY - Database Helper
// Proper connection handling with retries, timeout, and terminal logging
// =========================

const { createClient } = require('@libsql/client');

let client = null;
let clientError = null;

function getClient() {
    if (clientError) {
        throw new Error(clientError);
    }
    if (!client) {
        if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
            clientError = 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel environment variables.';
            console.error('[DB] ' + clientError);
            throw new Error(clientError);
        }
        try {
            client = createClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN,
            });
            console.error('[DB] Client created for URL:', process.env.TURSO_DATABASE_URL);
        } catch (err) {
            clientError = 'Failed to create Turso client: ' + err.message;
            console.error('[DB] ' + clientError);
            throw new Error(clientError);
        }
    }
    return client;
}

function resetClient() {
    client = null;
    clientError = null;
    console.error('[DB] Client reset');
}

async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.error('[DB] Attempt ' + (i + 1) + ' failed:', err.message);
            if (i < maxRetries - 1) {
                console.error('[DB] Retrying in ' + (delayMs * (i + 1)) + 'ms...');
                await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
            }
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

module.exports = { getClient, resetClient, withRetry, withTimeout, json };
