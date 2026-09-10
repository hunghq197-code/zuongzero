import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanLoginOtpChallenge,
  cleanLoginOtpCode,
  LOGIN_OTP_CODE_LENGTH,
  LOGIN_OTP_MAX_ATTEMPTS,
  LOGIN_OTP_MAX_AGE_MINUTES,
  maskEmail,
} from '../../lib/login-otp-utils.ts';

test('login OTP constants are intentionally short-lived and bounded', () => {
  assert.equal(LOGIN_OTP_CODE_LENGTH, 6);
  assert.equal(LOGIN_OTP_MAX_AGE_MINUTES, 10);
  assert.equal(LOGIN_OTP_MAX_ATTEMPTS, 5);
});

test('login OTP helpers clean user input safely', () => {
  assert.equal(cleanLoginOtpCode(' 12 3-456-789 '), '123456');
  assert.equal(cleanLoginOtpCode(null), '');
  assert.equal(cleanLoginOtpChallenge('abc'), '');
  assert.equal(cleanLoginOtpChallenge('a'.repeat(32)), 'a'.repeat(32));
  assert.equal(cleanLoginOtpChallenge('a'.repeat(201)).length, 200);
});

test('login OTP masks recipient emails', () => {
  assert.equal(maskEmail('artist@example.com'), 'ar***t@example.com');
  assert.equal(maskEmail('ab@example.com'), 'a*@example.com');
  assert.equal(maskEmail('not-an-email'), 'not-an-email');
});
