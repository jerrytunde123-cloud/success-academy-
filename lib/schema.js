const { execute, query } = require('./db');
const { migrate } = require('./schema-core');

let ready = null;

function ensureSchema() {
    if (!ready) {
        ready = migrate({
            execute: execute,
            query: query
        }).catch(function (err) {
            // Do not cache a failed migration; the next invocation should retry.
            ready = null;
            throw err;
        });
    }
    return ready;
}

function __resetSchemaForTests() {
    ready = null;
}

module.exports = { ensureSchema, __resetSchemaForTests };
