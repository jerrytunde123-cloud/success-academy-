const test = require('node:test');
const assert = require('node:assert/strict');
const { createSqliteAdapter } = require('./helpers');
const { migrate, SCHEMA_VERSION } = require('../lib/schema-core');

async function hasColumn(adapter, table, column) {
    const rows = await adapter.query('PRAGMA table_info("' + table + '")');
    return rows.some(function (row) {
        return row.name === column;
    });
}

test('migrate() upgrades the legacy schema without losing existing data', async () => {
    const adapter = createSqliteAdapter();

    try {
        await adapter.execute('CREATE TABLE exams (id TEXT PRIMARY KEY, name TEXT, slug TEXT, logo TEXT, prices TEXT, allow TEXT, subjects TEXT);');
        await adapter.execute('CREATE TABLE pins (pin TEXT PRIMARY KEY, examId TEXT, subjects TEXT, deviceId TEXT, date TEXT);');
        await adapter.execute('CREATE TABLE enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, exam TEXT, message TEXT, date TEXT);');
        await adapter.execute('CREATE TABLE news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, images TEXT, date TEXT);');
        await adapter.execute('CREATE TABLE visitors (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT);');

        const subjects = JSON.stringify([{ name: 'English Language', content: 'Old content', thumbnail: '', qaImages: [] }]);
        const prices = JSON.stringify({ per_subject: 1000, per_dept: 5000, all_subjects: 8000 });
        const allow = JSON.stringify({ per_subject: true, per_dept: true, all_subjects: true });

        await adapter.execute(
            'INSERT INTO exams (id, name, slug, logo, prices, allow, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['1', 'WAEC', 'waec', 'waec-logo.png', prices, allow, subjects]
        );
        await adapter.execute(
            'INSERT INTO pins (pin, examId, subjects, deviceId, date) VALUES (?, ?, ?, ?, ?)',
            ['OLDPIN1', '1', JSON.stringify(['English Language']), 'DEV-OLDTEST1', '2025-01-01T00:00:00.000Z']
        );
        await adapter.execute(
            'INSERT INTO news (title, content, images, date) VALUES (?, ?, ?, ?)',
            ['Old news', 'Still here', '[]', '2025-01-01T00:00:00.000Z']
        );

        await migrate(adapter);

        assert.equal(await hasColumn(adapter, 'exams', 'updatedAt'), true);
        assert.equal(await hasColumn(adapter, 'pins', 'orderRef'), true);
        assert.equal(await hasColumn(adapter, 'pins', 'active'), true);
        assert.equal(await hasColumn(adapter, 'pins', 'lastUsedAt'), true);
        assert.equal(await hasColumn(adapter, 'enquiries', 'repliedAt'), true);
        assert.equal(await hasColumn(adapter, 'news', 'updatedAt'), true);

        const oldPin = await adapter.query('SELECT * FROM pins WHERE pin = ?', ['OLDPIN1']);
        assert.equal(oldPin.length, 1);
        assert.equal(oldPin[0].active, 1);
        assert.equal(oldPin[0].orderRef, null);

        const oldExam = await adapter.query('SELECT * FROM exams WHERE id = ?', ['1']);
        assert.equal(oldExam.length, 1);
        assert.equal(oldExam[0].name, 'WAEC');
        assert.equal(JSON.parse(oldExam[0].subjects)[0].content, 'Old content');

        const examCount = await adapter.query('SELECT COUNT(*) AS count FROM exams');
        assert.equal(Number(examCount[0].count), 9);

        const oldNews = await adapter.query('SELECT * FROM news WHERE title = ?', ['Old news']);
        assert.equal(oldNews.length, 1);
        assert.equal(oldNews[0].content, 'Still here');

        const version = await adapter.query("SELECT value FROM meta WHERE key = 'schema_version'");
        assert.equal(version[0].value, String(SCHEMA_VERSION));

        const tables = await adapter.query("SELECT name FROM sqlite_master WHERE type = 'table'");
        const names = tables.map(function (row) { return row.name; });
        ['orders', 'rate_limits', 'meta', 'exams', 'pins', 'enquiries', 'news', 'visitors'].forEach(function (table) {
            assert.equal(names.indexOf(table) !== -1, true, 'missing table: ' + table);
        });

        // Force a second migration pass. Existing columns must not cause an error.
        await adapter.execute("UPDATE meta SET value = '0' WHERE key = 'schema_version'");
        await migrate(adapter);

        const versionAgain = await adapter.query("SELECT value FROM meta WHERE key = 'schema_version'");
        assert.equal(versionAgain[0].value, String(SCHEMA_VERSION));
        const examCountAgain = await adapter.query('SELECT COUNT(*) AS count FROM exams');
        assert.equal(Number(examCountAgain[0].count), 9);
    } finally {
        adapter.close();
    }
});
