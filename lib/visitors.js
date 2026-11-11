const { execute } = require('./db');

async function recordVisit() {
    const today = new Date().toISOString().split('T')[0];
    await execute('INSERT INTO visitors (date) VALUES (?)', [today]);
}

module.exports = { recordVisit };
