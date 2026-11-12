// Schema + migration logic. This module is intentionally database-agnostic:
// it receives an adapter with execute(sql, args) and query(sql, args), so it
// can be tested against node:sqlite as well as running against Turso.

const {
    DEFAULT_EXAMS,
    DEFAULT_PRICES,
    DEFAULT_ALLOW,
    buildDefaultSubjects
} = require('./constants');

const SCHEMA_VERSION = 4;

const DDL = [
    `CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        logo TEXT,
        prices TEXT NOT NULL,
        "allow" TEXT NOT NULL,
        subjects TEXT NOT NULL,
        updatedAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS pins (
        pin TEXT PRIMARY KEY,
        examId TEXT NOT NULL,
        subjects TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        date TEXT NOT NULL,
        orderRef TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        lastUsedAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS orders (
        reference TEXT PRIMARY KEY,
        examId TEXT NOT NULL,
        packageType TEXT NOT NULL,
        subjects TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        email TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        status TEXT NOT NULL DEFAULT 'pending',
        pin TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        paidAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS tutorial_orders (
        reference TEXT PRIMARY KEY,
        examId TEXT NOT NULL,
        tutorialLink TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt TEXT NOT NULL,
        paidAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS enquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        phone TEXT,
        exam TEXT,
        message TEXT,
        date TEXT,
        repliedAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        images TEXT,
        date TEXT,
        updatedAt TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        resetAt TEXT NOT NULL
    );`
];

const INDEXES = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_pins_orderRef ON pins(orderRef) WHERE orderRef IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_pins_active ON pins(active);',
    'CREATE INDEX IF NOT EXISTS idx_pins_date ON pins(date);',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);',
    'CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt);',
    'CREATE INDEX IF NOT EXISTS idx_tutorial_orders_status ON tutorial_orders(status);',
    'CREATE INDEX IF NOT EXISTS idx_enquiries_date ON enquiries(date);',
    'CREATE INDEX IF NOT EXISTS idx_visitors_date ON visitors(date);',
    'CREATE INDEX IF NOT EXISTS idx_rate_limits_resetAt ON rate_limits(resetAt);'
];

const COLUMN_MIGRATIONS = [
    { table: 'exams', column: 'updatedAt', definition: 'TEXT' },
    { table: 'exams', column: 'tutorialPrice', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'exams', column: 'tutorialLink', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'exams', column: 'tutorialBenefits', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'tutorial_orders', column: 'tutorialLink', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'pins', column: 'orderRef', definition: 'TEXT' },
    { table: 'pins', column: 'active', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { table: 'pins', column: 'lastUsedAt', definition: 'TEXT' },
    { table: 'enquiries', column: 'repliedAt', definition: 'TEXT' },
    { table: 'news', column: 'updatedAt', definition: 'TEXT' }
];

const SUBJECTS_JSON = JSON.stringify(buildDefaultSubjects());
const PRICES_JSON = JSON.stringify(DEFAULT_PRICES);
const ALLOW_JSON = JSON.stringify(DEFAULT_ALLOW);

const SEED_EXAMS = DEFAULT_EXAMS.map(function (exam) {
    return {
        sql: 'INSERT OR IGNORE INTO exams (id, name, slug, logo, prices, "allow", subjects) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [exam.id, exam.name, exam.slug, exam.logo, PRICES_JSON, ALLOW_JSON, SUBJECTS_JSON]
    };
});

function isDuplicateColumnError(err) {
    return String((err && err.message) || '').toLowerCase().indexOf('duplicate column name') !== -1;
}

function isMissingTableError(err) {
    return String((err && err.message) || '').toLowerCase().indexOf('no such table') !== -1;
}

async function columnExists(db, table, column) {
    const rows = await db.query('PRAGMA table_info("' + table + '")');
    return rows.some(function (row) {
        return row.name === column;
    });
}

async function migrate(db) {
    // On a warm schema this is the only query a cold start needs. Creating the
    // meta table first would add a second network round-trip to every start.
    let versionRows;
    try {
        versionRows = await db.query("SELECT value FROM meta WHERE key = 'schema_version'");
    } catch (err) {
        if (!isMissingTableError(err)) {
            throw err;
        }
        await db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
        versionRows = [];
    }

    const currentVersion = Number((versionRows[0] && versionRows[0].value) || 0);
    if (currentVersion >= SCHEMA_VERSION) {
        return;
    }

    for (const statement of DDL) {
        await db.execute(statement);
    }

    for (const migration of COLUMN_MIGRATIONS) {
        const exists = await columnExists(db, migration.table, migration.column);
        if (exists) {
            continue;
        }
        try {
            await db.execute(
                'ALTER TABLE "' + migration.table + '" ADD COLUMN ' + migration.column + ' ' + migration.definition
            );
        } catch (err) {
            // Two cold starts can race this migration. Ignoring the duplicate
            // column error is safe because the column now exists.
            if (!isDuplicateColumnError(err)) {
                throw err;
            }
        }
    }

    for (const statement of INDEXES) {
        await db.execute(statement);
    }

    for (const seed of SEED_EXAMS) {
        await db.execute(seed.sql, seed.args);
    }

    await db.execute(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [String(SCHEMA_VERSION)]
    );
}

module.exports = {
    SCHEMA_VERSION,
    DDL,
    INDEXES,
    COLUMN_MIGRATIONS,
    SEED_EXAMS,
    migrate
};
