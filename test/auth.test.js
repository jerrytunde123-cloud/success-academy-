const test = require('node:test');
const assert = require('node:assert/strict');
const { createReq, createRes } = require('./helpers');

process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_SESSION_SECRET = 'test-session-secret';

const {
    safeEqual,
    signSession,
    verifySession,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    requireAdmin
} = require('../lib/auth');

test('safeEqual compares passwords without leaking length', function () {
    assert.equal(safeEqual('password', 'password'), true);
    assert.equal(safeEqual('password', 'passwore'), false);
    assert.equal(safeEqual('short', 'a-much-longer-value'), false);
});

test('signed admin sessions verify and reject tampering', function () {
    const token = signSession();
    const session = verifySession(token);
    assert.equal(session.sub, 'admin');
    assert.equal(Number.isInteger(session.exp), true);

    assert.equal(verifySession(token + 'x'), null);
    assert.equal(verifySession(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), null);
    assert.equal(verifySession('nonsense'), null);
});

test('cookies are parsed and session cookies are HttpOnly and SameSite', function () {
    const cookies = parseCookies('one=1; sa_admin=abc%2Edef; empty=');
    assert.equal(cookies.one, '1');
    assert.equal(cookies.sa_admin, 'abc.def');

    const res = createRes();
    setSessionCookie(createReq({ headers: { 'x-forwarded-proto': 'https' } }), res);
    const header = res.headers['set-cookie'];
    assert.match(header, /sa_admin=/);
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Secure/);

    clearSessionCookie(createReq({}), res);
    assert.match(res.headers['set-cookie'], /Max-Age=0/);
    assert.doesNotMatch(res.headers['set-cookie'], /Secure/);
});

test('requireAdmin returns 401 without a valid cookie and accepts a valid one', function () {
    const unauthorizedRes = createRes();
    const unauthorized = requireAdmin(createReq({ headers: { cookie: '' } }), unauthorizedRes);
    assert.equal(unauthorized, false);
    assert.equal(unauthorizedRes.statusCode, 401);
    assert.equal(unauthorizedRes.body.error, 'Unauthorized');

    const token = signSession();
    const authorizedRes = createRes();
    const authorized = requireAdmin(createReq({ headers: { cookie: 'sa_admin=' + encodeURIComponent(token) } }), authorizedRes);
    assert.equal(authorized, true);
    assert.equal(authorizedRes.headersSent, false);
});

test('cross-origin admin writes are rejected', function () {
    const token = signSession();
    const res = createRes();
    assert.throws(function () {
        requireAdmin(
            createReq({
                method: 'POST',
                headers: {
                    cookie: 'sa_admin=' + encodeURIComponent(token),
                    origin: 'https://attacker.example',
                    host: 'success-academy.example'
                }
            }),
            res
        );
    }, function (err) {
        return err && err.status === 403;
    });
});
