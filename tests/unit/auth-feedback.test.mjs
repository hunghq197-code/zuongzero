import assert from 'node:assert/strict';
import test from 'node:test';

import { authRateLimitMessage } from '../../lib/auth-feedback.ts';

void test('auth wait messages are short, localized and bound untrusted query values', () => {
  assert.match(authRateLimitMessage('45'), /45 giây/);
  assert.match(authRateLimitMessage('61'), /2 phút/);
  assert.match(authRateLimitMessage(null), /1 phút/);
  assert.match(authRateLimitMessage('invalid'), /1 phút/);
  assert.match(authRateLimitMessage('Infinity'), /60 phút/);
  assert.match(authRateLimitMessage('-4'), /1 giây/);
});
