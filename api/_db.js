// =========================
// SUCCESS ACADEMY - Database Helper
// Proper connection handling with retries and clear errors
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
            throw new Error(clientError);
        }
        try {
            client = createClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN,
            });
        } catch (err) {
            clientError = 'Failed to create Turso client: ' + err.message;
            throw new Error(clientError);
        }
    }
    return client;
}

function resetClient() {
    client = null;
    clientError = null;
}

async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < maxRetries - 1) {
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
