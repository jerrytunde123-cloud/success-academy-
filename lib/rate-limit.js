const { execute } = require('./db');
const { HttpError } = require('./http');

// Expired buckets are harmless, but without cleanup the table keeps one row
// for every IP/action pair forever. Delete them on a small sample of requests
// so the cost is negligible and the table stays bounded.
const CLEANUP_CHANCE = 0.02;

// One atomic upsert. resetAt is stored as an ISO timestamp so comparisons
// work lexicographically in SQLite.
const RATE_LIMIT_SQL = [
    'INSERT INTO rate_limits (key, count, resetAt)',
    'VALUES (?, 1, ?)',
    'ON CONFLICT(key) DO UPDATE SET',
    '  count = CASE WHEN rate_limits.resetAt <= ? THEN 1 ELSE rate_limits.count + 1 END,',
    '  resetAt = CASE WHEN rate_limits.resetAt <= ? THEN excluded.resetAt ELSE rate_limits.resetAt END',
    'RETURNING count, resetAt'
].join(' ');

async function enforceRateLimit(key, limit, windowSeconds) {
    const now = new Date();
    const nowIso = now.toISOString();
    const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();

    const result = await execute(RATE_LIMIT_SQL, [key, resetAt, nowIso, nowIso]);
    const row = result.rows && result.rows[0];
    if (!row) {
        return;
    }

    const count = Number(row.count);
    if (count > limit) {
        const retryAfter = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000));
        throw new HttpError(429, 'Too many requests. Please try again later.', { retryAfter: retryAfter });
    }

    if (Math.random() < CLEANUP_CHANCE) {
        try {
            await execute('DELETE FROM rate_limits WHERE resetAt <= ?', [nowIso]);
        } catch (err) {
            // Cleanup must never break the request it happens to run on.
            console.error('[rate-limit] cleanup failed:', err.message);
        }
    }
}

module.exports = { RATE_LIMIT_SQL, enforceRateLimit };
