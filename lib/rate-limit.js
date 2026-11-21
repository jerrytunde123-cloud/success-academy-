const { execute } = require('./db');
const { HttpError } = require('./http');

// Expired buckets are harmless, but without cleanup the table keeps one row
// for every IP/action pair forever. Delete them on a small sample of requests
// so the cost is negligible and the table stays bounded.
const CLEANUP_CHANCE = 0.02;

// Lockout thresholds: after N failures, lock the IP for M seconds.
// The lock duration increases with each threshold crossed.
const FAIL_THRESHOLDS = [
    // 5 failures → 1 min lock
    [5, 60],
    // 10 failures → 5 min lock
    [10, 300],
    // 15 failures → 15 min lock
    [15, 900],
    // 20 failures → 1 hour lock
    [20, 3600],
];

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

/**
 * Track a failed login attempt for the given IP.
 * Returns an object with the current failure count and whether the IP is locked.
 */
async function recordLoginFailure(ip) {
    const now = new Date();
    const nowIso = now.toISOString();

    // First check if IP is currently locked out
    const checkSql = 'SELECT count, lastAt, lockedUntil FROM login_failures WHERE ip = ?';
    const checkResult = await execute(checkSql, [ip]);
    const row = checkResult.rows && checkResult.rows[0];

    let failureCount = 0;
    let isLocked = false;
    let retryAfter = 0;
    let lockedUntil = null;

    if (row) {
        failureCount = Number(row.count) || 0;
        lockedUntil = row.lockedUntil;

        // If IP has a lockedUntil date and it's in the future, the IP is locked
        if (lockedUntil) {
            const lockExpiry = new Date(lockedUntil);
            if (lockExpiry > now) {
                isLocked = true;
                retryAfter = Math.ceil((lockExpiry.getTime() - now.getTime()) / 1000);
                return {
                    failureCount,
                    isLocked,
                    retryAfter,
                    lockedUntil: lockedUntil
                };
            }
            // Lock has expired; reset the lockedUntil so we can re-use the row
            // but we'll reset the count below.
            lockedUntil = null;
        }

        // Lock has expired or never existed—reset count and increment
        // But first, if failureCount >= a threshold, lock the IP
        for (const [threshold, duration] of FAIL_THRESHOLDS) {
            if (failureCount >= threshold) {
                isLocked = true;
                const lockExpiry = new Date(now.getTime() + duration * 1000);
                await execute(
                    'UPDATE login_failures SET count = ?, lastAt = ?, lockedUntil = ? WHERE ip = ?',
                    [failureCount, nowIso, lockExpiry.toISOString(), ip]
                );
                retryAfter = duration;
                return {
                    failureCount: threshold, // show the threshold that triggered the lock
                    isLocked,
                    retryAfter,
                    lockedUntil: lockExpiry.toISOString()
                };
            }
        }

        // Below all thresholds—just increment the count
        await execute(
            'UPDATE login_failures SET count = ?, lastAt = ? WHERE ip = ?',
            [failureCount + 1, nowIso, ip]
        );
        return {
            failureCount: failureCount + 1,
            isLocked: false,
            retryAfter: 0,
            lockedUntil: null
        };
    }

    // No row exists for this IP yet—create one with count = 1
    await execute(
        'INSERT INTO login_failures (ip, count, lastAt, lockedUntil) VALUES (?, 1, ?, ?)',
        [ip, nowIso, '']
    );
    return {
        failureCount: 1,
        isLocked: false,
        retryAfter: 0,
        lockedUntil: null
    };
}

/**
 * Clear failed login attempts for an IP (called on successful login).
 */
async function clearLoginFailures(ip) {
    try {
        await execute('DELETE FROM login_failures WHERE ip = ?', [ip]);
    } catch (err) {
        console.error('[rate-limit] failed to clear failures:', err.message);
    }
}

/**
 * Get the current lock state for an IP without incrementing the failure count.
 * Useful for pre-checks before showing login forms.
 */
async function getLockState(ip) {
    const now = new Date();
    const nowIso = now.toISOString();

    const checkSql = 'SELECT count, lastAt, lockedUntil FROM login_failures WHERE ip = ?';
    const checkResult = await execute(checkSql, [ip]);
    const row = checkResult.rows && checkResult.rows[0];

    if (!row) {
        return { failureCount: 0, isLocked: false, retryAfter: 0, lockedUntil: null };
    }

    let failureCount = Number(row.count) || 0;
    let lockedUntil = row.lockedUntil;

    if (lockedUntil) {
        const lockExpiry = new Date(lockedUntil);
        if (lockExpiry > now) {
            return {
                failureCount,
                isLocked: true,
                retryAfter: Math.ceil((lockExpiry.getTime() - now.getTime()) / 1000),
                lockedUntil: lockedUntil
            };
        }
        // Lock has expired, reset
        lockedUntil = null;
    }

    return { failureCount, isLocked: false, retryAfter: 0, lockedUntil: null };
}

// Enforce rate limiting for a given key, limit, and window.
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

module.exports = { enforceRateLimit, recordLoginFailure, clearLoginFailures, getLockState, FAIL_THRESHOLDS };