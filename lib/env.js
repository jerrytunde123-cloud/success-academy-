// `vercel dev` reads `.env` and the linked project's Development variables,
// but zero-config projects do not automatically load `.env.local`. Load it
// explicitly so local-only keys (for example Paystack test keys) work.
//
// Node's env-file loader never overwrites a variable that is already set, so
// values from Vercel, the shell, or the test runner always take precedence.

const fs = require('node:fs');
const path = require('node:path');

const localEnvPath = path.join(__dirname, '..', '.env.local');
const isLocal = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';

if (isLocal && typeof process.loadEnvFile === 'function' && fs.existsSync(localEnvPath)) {
    try {
        process.loadEnvFile(localEnvPath);
    } catch (err) {
        console.warn('[env] Could not load .env.local: ' + err.message);
    }
}
