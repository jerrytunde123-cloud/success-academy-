const test = require('node:test');
const assert = require('node:assert/strict');
const { isConnectError, normalizeDbUrl } = require('../lib/db');

function withCause(error, cause) {
    error.cause = cause;
    return error;
}

test('isConnectError() only accepts failures that happened before a request was sent', function () {
    const timeout = withCause(
        new Error('fetch failed'),
        Object.assign(new Error('Connect Timeout Error (attempted address: db.turso.io:443, timeout: 10000ms)'), {
            code: 'UND_ERR_CONNECT_TIMEOUT'
        })
    );
    assert.equal(isConnectError(timeout), true);

    const refused = withCause(
        new Error('fetch failed'),
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' })
    );
    assert.equal(isConnectError(refused), true);

    const dns = withCause(
        new Error('fetch failed'),
        Object.assign(new Error('getaddrinfo ENOTFOUND db.turso.io'), { code: 'ENOTFOUND' })
    );
    assert.equal(isConnectError(dns), true);

    // A connection that dropped mid-request may already have executed a
    // write, so it must never be retried automatically.
    const reset = withCause(
        new Error('fetch failed'),
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    );
    assert.equal(isConnectError(reset), false);
    assert.equal(isConnectError(new Error('Database query timed out')), false);
});

test('normalizeDbUrl() converts libsql:// to the HTTP endpoint', function () {
    assert.equal(
        normalizeDbUrl('libsql://example.turso.io'),
        'https://example.turso.io'
    );
    assert.equal(normalizeDbUrl('https://example.turso.io'), 'https://example.turso.io');
    assert.throws(function () {
        normalizeDbUrl('postgres://example');
    }, /Database URL is invalid/);
});
