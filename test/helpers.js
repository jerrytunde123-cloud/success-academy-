// Shared test helpers. Tests use an in-memory node:sqlite database and mock
// the fetch calls made to Paystack, so no real credentials are required.

const { DatabaseSync } = require('node:sqlite');

function isReaderStatement(sql) {
    return /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
}

function createSqliteAdapter() {
    const raw = new DatabaseSync(':memory:');

    function normalizeParams(args) {
        return (args || []).map(function (value) {
            return value === undefined ? null : value;
        });
    }

    function runStatement(sql, args) {
        const statement = raw.prepare(sql);
        const params = normalizeParams(args);

        if (isReaderStatement(sql)) {
            return {
                rows: statement.all(...params),
                rowsAffected: 0,
                lastInsertRowid: null
            };
        }

        const result = statement.run(...params);
        return {
            rows: [],
            rowsAffected: Number(result.changes || 0),
            lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
                ? null
                : Number(result.lastInsertRowid)
        };
    }

    return {
        execute: async function (sqlOrObject, args) {
            if (sqlOrObject && typeof sqlOrObject === 'object') {
                return runStatement(sqlOrObject.sql, sqlOrObject.args);
            }
            return runStatement(sqlOrObject, args);
        },
        query: async function (sql, args) {
            return runStatement(sql, args).rows;
        },
        batch: async function (statements) {
            raw.exec('BEGIN');
            try {
                const results = statements.map(function (statement) {
                    return runStatement(statement.sql, statement.args);
                });
                raw.exec('COMMIT');
                return results;
            } catch (err) {
                raw.exec('ROLLBACK');
                throw err;
            }
        },
        close: function () {
            raw.close();
        },
        raw: raw
    };
}

function createReq(options) {
    const opts = options || {};
    const req = {
        method: opts.method || 'GET',
        url: opts.url || '/',
        headers: Object.assign({ 'x-forwarded-for': '127.0.0.1' }, opts.headers || {}),
        socket: { remoteAddress: '127.0.0.1' }
    };
    if (opts.body !== undefined) {
        req.body = opts.body;
    }
    return req;
}

function createRes() {
    return {
        statusCode: 200,
        headersSent: false,
        headers: {},
        body: null,
        setHeader: function (name, value) {
            this.headers[String(name).toLowerCase()] = value;
        },
        end: function (chunk) {
            this.headersSent = true;
            if (typeof chunk === 'string' && chunk.length > 0) {
                try {
                    this.body = JSON.parse(chunk);
                } catch (_err) {
                    this.body = chunk;
                }
            }
        }
    };
}

function jsonResponse(body, status) {
    const code = status || 200;
    return {
        ok: code >= 200 && code < 300,
        status: code,
        json: async function () {
            return body;
        }
    };
}

function getSetCookie(res) {
    return res.headers['set-cookie'] || '';
}

function extractCookie(res) {
    const match = String(getSetCookie(res)).match(/sa_admin=([^;]+)/);
    return match ? 'sa_admin=' + match[1] : '';
}

module.exports = {
    createSqliteAdapter,
    createReq,
    createRes,
    jsonResponse,
    getSetCookie,
    extractCookie
};
