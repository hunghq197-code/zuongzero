import assert from 'node:assert/strict';
import test from 'node:test';
import { readHeaderIdentity } from '../../lib/header-identity.ts';

void test('app sessions reject every header identity, including a forged admin', () => {
  const headers = new Headers({
    'oai-authenticated-user-id': 'forged-admin',
    'oai-authenticated-user-email': 'admin@example.com',
    'cf-access-authenticated-user-email': 'admin@example.com',
  });
  assert.equal(readHeaderIdentity(headers, 'app-session'), null);
  assert.equal(readHeaderIdentity(headers, 'unknown-provider'), null);
});

void test('provider-specific identity does not accept the other provider headers', () => {
  const chatgptHeaders = new Headers({
    'oai-authenticated-user-id': 'preview-user',
    'oai-authenticated-user-email': 'preview@sites.test',
    'oai-authenticated-user-full-name': encodeURIComponent('Người thử nghiệm'),
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
  });
  assert.equal(readHeaderIdentity(chatgptHeaders, 'cloudflare-access'), null);
  assert.equal(
    readHeaderIdentity(chatgptHeaders)?.displayName,
    'Người thử nghiệm',
  );
  const accessHeaders = new Headers({
    'cf-access-authenticated-user-email': 'User@Example.com',
  });
  assert.equal(readHeaderIdentity(accessHeaders, 'chatgpt'), null);
  assert.equal(
    readHeaderIdentity(accessHeaders, 'cloudflare-access')?.email,
    'user@example.com',
  );
});
