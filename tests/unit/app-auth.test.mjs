import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createPasswordHash,
  createSessionToken,
  hashOptionalRequestValue,
  hashSessionToken,
  isValidPassword,
  readCookie,
  safeRelativeReturnPath,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifyPlainSecret,
} from '../../lib/app-auth.ts';

test('password policy and PBKDF2 verification work end to end', async () => {
  const password = 'artist-portal-strong-password';
  const hash = await createPasswordHash(password);

  assert.equal(isValidPassword('too-short'), false);
  assert.equal(isValidPassword('123456789012'), true);
  assert.equal(isValidPassword('x'.repeat(129)), false);
  assert.match(hash, /^pbkdf2-sha256:100000:/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword(password, 'plain-text'), false);
  assert.equal(await verifyPlainSecret('same-secret', 'same-secret'), true);
  assert.equal(await verifyPlainSecret('same-secret', 'other-secret'), false);
});

test('session helpers hash tokens and set hardened cookies', async () => {
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const userAgentHash = await hashOptionalRequestValue('Mozilla/5.0');
  const cookie = buildSessionCookie(
    token,
    'https://artistportal.zuongzeroent.com/login',
  );
  const localCookie = buildSessionCookie(token, 'http://localhost:3000/login');
  const expiredCookie = buildExpiredSessionCookie(
    'https://artistportal.zuongzeroent.com/login',
  );

  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(tokenHash, token);
  assert.equal(typeof userAgentHash, 'string');
  assert.match(cookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(localCookie, /Secure/);
  assert.match(expiredCookie, /Max-Age=0/);
});

test('return paths and cookies cannot escape the app', () => {
  assert.equal(
    safeRelativeReturnPath('/admin?period=2026-Q1#statement'),
    '/admin?period=2026-Q1#statement',
  );
  assert.equal(safeRelativeReturnPath('https://evil.test/admin'), '/');
  assert.equal(safeRelativeReturnPath('//evil.test/admin'), '/');
  assert.equal(safeRelativeReturnPath('/api/auth/login'), '/');
  assert.equal(
    readCookie(
      'a=1; royalty_dashboard_session=abc.def; theme=dark',
      SESSION_COOKIE_NAME,
    ),
    'abc.def',
  );
  assert.equal(readCookie(null, SESSION_COOKIE_NAME), null);
});
