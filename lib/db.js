// Lazily-created Turso client for Vercel serverless functions.
// Uses Turso's official serverless driver through its libSQL-compatible
// layer: SQL over HTTP with zero native dependencies.

const { createClient } = require('@tursodatabase/serverless/compat');
const { HttpError } = require('./http');

// undici gives up on a TCP connect after 10 seconds. Our own deadline has to
// be higher than that, otherwise a slow connect is reported as our timeout
// and can never be retried. Batches get a larger budget because they may
// contain several statements.
const DB_TIMEOUT_MS = 15000;
const BATCH_TIMEOUT_MS = 30000;

// A failed connect never reached the database, so trying again cannot
// duplicate a write.
const CONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 300;

let client = null;

function normalizeDbUrl(url) {
    const value = String(url || '').trim();
    if (value.indexOf('libsql://') === 0) {
        return 'https://' + value.slice('libsql://'.length);
    }
    if (value.indexOf('https://') === 0 || value.indexOf('http://') === 0) {
        return value;
    }
    throw new HttpError(503, 'Database URL is invalid. Set TURSO_DATABASE_URL in Vercel.');
}

function getDb() {
    if (client) {
        return client;
    }

    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        throw new HttpError(503, 'Database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    }

    try {
        client = createClient({
            url: normalizeDbUrl(url),
            authToken: authToken
        });
    } catch (err) {
        throw new HttpError(503, 'Database client could not start: ' + err.message);
    }

    return client;
}

function isDbConfigured() {
    return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () {
            reject(new HttpError(504, label + ' timed out'));
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(function () {
        clearTimeout(timer);
    });
}

function errorChain(err) {
    const chain = [];
    let current = err;
    while (current && chain.length < 6) {
        chain.push(current);
        current = current.cause;
    }
    return chain;
}

// Only errors that prove the request never reached the server are safe to
// retry for writes. A dropped connection after the request was sent could
// have already executed, so it is deliberately not included here.
function isConnectError(err) {
    return errorChain(err).some(function (item) {
        const code = String(item.code || '').toUpperCase();
        const message = String(item.message || '').toLowerCase();
        return (
            code === 'UND_ERR_CONNECT_TIMEOUT' ||
            code === 'ECONNREFUSED' ||
            code === 'ENOTFOUND' ||
            code === 'EAI_AGAIN' ||
            message.indexOf('connect timeout error') !== -1
        );
    });
}

// Reads are idempotent, so gateway/network failures are also safe to retry.
function isRetryableReadError(err) {
    if (isConnectError(err)) {
        return true;
    }
    const message = String((err && err.message) || '').toLowerCase();
    return (
        message.indexOf('fetch failed') !== -1 ||
        /http error!?\s*status:\s*5\d\d/.test(message)
    );
}

function sleep(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

async function retry(operation, shouldRetry) {
    let lastError;
    for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
        try {
            return await operation();
        } catch (err) {
            lastError = err;
            if (attempt === CONNECT_RETRIES || !shouldRetry(err)) {
                if (isConnectError(err)) {
                    throw new HttpError(503, 'Database is temporarily unavailable. Please try again.');
                }
                throw err;
            }
            await sleep(RETRY_DELAY_MS * attempt);
        }
    }
    throw lastError;
}

async function execute(sql, args) {
    return retry(function () {
        const db = getDb();
        return withTimeout(
            db.execute({ sql: sql, args: args || [] }),
            DB_TIMEOUT_MS,
            'Database query'
        );
    }, isConnectError);
}

async function query(sql, args) {
    return retry(async function () {
        const db = getDb();
        const result = await withTimeout(
            db.execute({ sql: sql, args: args || [] }),
            DB_TIMEOUT_MS,
            'Database query'
        );
        return result.rows || [];
    }, isRetryableReadError);
}

async function queryOne(sql, args) {
    const rows = await query(sql, args);
    return rows.length > 0 ? rows[0] : null;
}

async function run(sql, args) {
    const result = await execute(sql, args);
    return {
        changes: Number(result.rowsAffected || 0),
        lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
            ? null
            : Number(result.lastInsertRowid)
    };
}

async function batch(statements) {
    return retry(function () {
        const db = getDb();
        return withTimeout(
            db.batch(statements, 'write'),
            BATCH_TIMEOUT_MS,
            'Database batch'
        );
    }, isConnectError);
}

function __setTestDb(testDb) {
    client = testDb;
}

function __resetTestDb() {
    client = null;
}

module.exports = {
    DB_TIMEOUT_MS,
    getDb,
    isDbConfigured,
    normalizeDbUrl,
    withTimeout,
    isConnectError,
    execute,
    query,
    queryOne,
    run,
    batch,
    __setTestDb,
    __resetTestDb
};
