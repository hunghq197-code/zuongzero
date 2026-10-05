import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';

import { createPasswordHash, hashSessionToken } from '../../lib/app-auth.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const password = 'demo-only-strong-password';
const recipient = 'artist@auth-demo.test';
const now = 1_900_000_000_000;
const emails = [];
let mf;
let db;

async function applyMigration(filename) {
  const sql = await readFile(join(root, 'drizzle', filename), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await db.prepare(statement.trim()).run();
  }
}

async function post(path, values, ip = '192.0.2.1') {
  return mf.dispatchFetch(`https://auth-demo.test${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': ip,
    },
    body: new URLSearchParams(values),
  });
}

async function limit(policy, identifier, time = now) {
  const response = await mf.dispatchFetch('https://auth-demo.test/test/limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, identifier, now: time }),
  });
  return response.json();
}

async function destination(response) {
  const body = await response.text();
  const match = body.match(/location\.replace\((.+)\);/);
  assert.ok(match, 'navigation response must contain a destination');
  return new URL(JSON.parse(match[1]), 'https://auth-demo.test');
}

async function startLogin(ip = '192.0.2.1') {
  const response = await post(
    '/api/auth/login',
    { email: recipient, password },
    ip,
  );
  assert.equal(response.status, 200);
  const url = await destination(response);
  assert.equal(url.pathname, '/login/verify');
  const code = emails.at(-1).text.match(/là: (\d{6})/)[1];
  return { challenge: url.searchParams.get('challenge'), code };
}

before(async () => {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['tests/auth/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:workers', 'node:net'],
  });
  mf = new Miniflare({
    script: result.outputFiles[0].text,
    modules: true,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    log: new Log(LogLevel.ERROR),
    bindings: {
      AUTH_PROVIDER: 'app-session',
      APP_BASE_URL: 'https://auth-demo.test',
      SUPER_ADMIN_EMAILS: 'admin@auth-demo.test',
      SUPER_ADMIN_PASSWORD: password,
      RESEND_API_KEY: 'test-only-no-live-mail',
      EMAIL_FROM: 'Demo <no-reply@auth-demo.test>',
    },
    outboundService: async (request) => {
      assert.equal(request.url, 'https://api.resend.com/emails');
      assert.equal(request.method, 'POST');
      emails.push(await request.json());
      return Response.json({ id: `demo-email-${emails.length}` });
    },
  });
  db = await mf.getD1Database('DB');
  for (const file of [
    '0000_graceful_sentinels.sql',
    '0004_orange_impossible_man.sql',
    '0005_graceful_nehzno.sql',
    '0008_login_otps.sql',
    '0013_auth_rate_limits.sql',
  ]) {
    await applyMigration(file);
  }
  const created = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, status, created_at)
     VALUES ('demo-client', ?, 'Demo Artist', 'client', 'active', ?)`,
    )
    .bind(recipient, created)
    .run();
  await db
    .prepare(
      `INSERT INTO password_credentials
     (id, user_id, password_hash, password_updated_at, must_change_password, created_at)
     VALUES ('demo-credential', 'demo-client', ?, ?, 0, ?)`,
    )
    .bind(await createPasswordHash(password), created, created)
    .run();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, status, created_at)
     VALUES ('demo-pending', 'pending@auth-demo.test', 'Pending', 'client', 'disabled', ?)`,
    )
    .bind(created)
    .run();
});

beforeEach(async () => {
  emails.length = 0;
  await db.batch([
    db.prepare('DELETE FROM auth_rate_limits'),
    db.prepare('DELETE FROM auth_sessions'),
    db.prepare('DELETE FROM auth_login_otps'),
    db.prepare('DELETE FROM account_invites'),
  ]);
});

after(async () => {
  await mf?.dispose();
});

void test('D1 admits exactly the allowed slots under concurrent requests', async () => {
  const attempts = await Promise.all(
    Array.from({ length: 25 }, () => limit('login_account', recipient)),
  );
  assert.equal(attempts.filter((item) => item.status === 'allowed').length, 10);
  assert.equal(attempts.filter((item) => item.status === 'blocked').length, 15);
  const row = await db.prepare('SELECT * FROM auth_rate_limits').first();
  assert.equal(row.request_count, 10);
  assert.equal(row.expires_at, now + 900_000);
  assert.notEqual(row.bucket_key, recipient);
  assert.doesNotMatch(row.bucket_key, /artist|auth-demo|192\.0/);
});

void test('denied attempts do not extend the window; expiry automatically permits retry', async () => {
  assert.equal((await limit('otp_cooldown', recipient)).status, 'allowed');
  assert.deepEqual(await limit('otp_cooldown', recipient, now + 1000), {
    status: 'blocked',
    retryAfterSeconds: 59,
  });
  assert.deepEqual(await limit('otp_cooldown', recipient, now + 30_000), {
    status: 'blocked',
    retryAfterSeconds: 30,
  });
  assert.equal(
    (await limit('otp_cooldown', recipient, now + 60_000)).status,
    'allowed',
  );
  assert.equal(
    (await limit('otp_cooldown', 'other@auth-demo.test')).status,
    'allowed',
  );
  assert.equal((await limit('recovery_cooldown', recipient)).status, 'allowed');
});

void test('only Cloudflare client IP is used; forwarded headers cannot rotate buckets', async () => {
  for (const headers of [
    { 'CF-Connecting-IP': 'not-an-ip', 'X-Forwarded-For': '192.0.2.7' },
    { 'X-Forwarded-For': '192.0.2.8', 'X-Real-IP': '192.0.2.9' },
  ]) {
    const response = await mf.dispatchFetch('https://auth-demo.test/test/ip', {
      headers,
    });
    const result = await response.json();
    assert.notEqual(result.ip, headers['X-Forwarded-For']);
    assert.notEqual(result.ip, headers['X-Real-IP']);
  }
});

void test('password guesses are bounded by account even when client IP changes', async () => {
  for (let index = 0; index < 10; index++) {
    const response = await post(
      '/api/auth/login',
      {
        email: index % 2 ? recipient.toUpperCase() : recipient,
        password: 'incorrect-password',
      },
      `192.0.2.${index + 1}`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      (await destination(response)).searchParams.get('error'),
      'invalid',
    );
  }
  const response = await post(
    '/api/auth/login',
    { email: recipient, password },
    '192.0.2.99',
  );
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(
    (await destination(response)).searchParams.get('error'),
    'rate_limited',
  );
  assert.equal(emails.length, 0);
});

void test('one IP cannot bypass password limits by changing email addresses', async () => {
  for (let index = 0; index < 60; index++) {
    const response = await post('/api/auth/login', {
      email: `missing-${index}@auth-demo.test`,
      password: 'incorrect-password',
    });
    assert.equal(response.status, 200);
    await response.text();
  }
  const response = await post('/api/auth/login', {
    email: recipient,
    password,
  });
  assert.equal(response.status, 429);
  assert.equal(emails.length, 0);
});

void test('OTP resend cooldown preserves the original challenge and does not create a session', async () => {
  const first = await startLogin();
  assert.equal(emails.length, 1);
  const response = await post(
    '/api/auth/login',
    { email: recipient, password },
    '192.0.2.2',
  );
  assert.equal(response.status, 429);
  assert.equal(emails.length, 1);
  const row = await db
    .prepare(
      'SELECT status FROM auth_login_otps WHERE challenge_token_hash = ?',
    )
    .bind(await hashSessionToken(first.challenge))
    .first();
  assert.equal(row.status, 'pending');
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM auth_sessions').first())
      .total,
    0,
  );

  await db
    .prepare('UPDATE auth_rate_limits SET expires_at = ?')
    .bind(Date.now() - 1)
    .run();
  await startLogin();
  assert.equal(emails.length, 2);
  const old = await db
    .prepare(
      'SELECT status FROM auth_login_otps WHERE challenge_token_hash = ?',
    )
    .bind(await hashSessionToken(first.challenge))
    .first();
  assert.equal(old.status, 'revoked');
});

void test('hourly OTP quota remains enforced after the short cooldown expires', async () => {
  for (let index = 0; index < 10; index++) {
    assert.equal((await limit('otp_hourly', recipient)).status, 'allowed');
  }
  const response = await post('/api/auth/login', {
    email: recipient,
    password,
  });
  assert.equal(response.status, 429);
  assert.equal(emails.length, 0);
});

void test('OTP email IP quota is enforced before a challenge is created', async () => {
  for (let index = 0; index < 30; index++) {
    assert.equal((await limit('otp_ip', '192.0.2.1')).status, 'allowed');
  }
  const response = await post('/api/auth/login', {
    email: recipient,
    password,
  });
  assert.equal(response.status, 429);
  assert.equal(emails.length, 0);
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM auth_login_otps').first())
      .total,
    0,
  );
});

void test('super admin uses the same OTP protections and receives no session before verification', async () => {
  const response = await post('/api/auth/login', {
    email: 'admin@auth-demo.test',
    password,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Set-Cookie'), null);
  const url = await destination(response);
  assert.equal(url.pathname, '/login/verify');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'admin@auth-demo.test');
  const user = await db
    .prepare("SELECT role FROM users WHERE email = 'admin@auth-demo.test'")
    .first();
  assert.equal(user.role, 'super_admin');
  const repeat = await post('/api/auth/login', {
    email: 'admin@auth-demo.test',
    password,
  });
  assert.equal(repeat.status, 429);
  assert.equal(emails.length, 1);
});

void test('recovery has equal outward responses for known, unknown and throttled accounts', async () => {
  const snapshots = [];
  for (const email of [recipient, 'missing@auth-demo.test']) {
    for (let index = 0; index < 2; index++) {
      const response = await post('/api/auth/forgot-password', { email });
      snapshots.push({
        status: response.status,
        location: response.headers.get('Location'),
        retry: response.headers.get('Retry-After'),
        body: await response.text(),
      });
    }
  }
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0]);
  assert.equal(snapshots[0].status, 303);
  assert.equal(emails.length, 1);
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM account_invites').first())
      .total,
    1,
  );
  assert.match(emails[0].subject, /mật khẩu/);
});

void test('recovery quota and pending-account activation are preserved', async () => {
  const response = await post('/api/auth/forgot-password', {
    email: 'pending@auth-demo.test',
  });
  assert.equal(response.status, 303);
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /Kích hoạt/);
  for (let index = 0; index < 3; index++) {
    assert.equal(
      (await limit('recovery_account', recipient)).status,
      'allowed',
    );
  }
  const denied = await post('/api/auth/forgot-password', { email: recipient });
  assert.equal(denied.status, 303);
  assert.equal(emails.length, 1);
});

void test('recovery IP quota blocks mail while retaining the generic response', async () => {
  for (let index = 0; index < 20; index++) {
    assert.equal((await limit('recovery_ip', '192.0.2.1')).status, 'allowed');
  }
  const response = await post('/api/auth/forgot-password', {
    email: recipient,
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Retry-After'), null);
  assert.equal(
    new URL(response.headers.get('Location')).searchParams.get('sent'),
    '1',
  );
  assert.equal(emails.length, 0);
});

void test('verification IP quota leaves a valid challenge untouched until retry is allowed', async () => {
  const { challenge, code } = await startLogin();
  for (let index = 0; index < 60; index++) {
    assert.equal((await limit('verify_ip', '192.0.2.1')).status, 'allowed');
  }
  const denied = await post('/api/auth/verify-login', { challenge, code });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Set-Cookie'), null);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  const row = await db
    .prepare('SELECT status, attempt_count FROM auth_login_otps')
    .first();
  assert.equal(row.status, 'pending');
  assert.equal(row.attempt_count, 0);
  const allowed = await post(
    '/api/auth/verify-login',
    { challenge, code },
    '192.0.2.2',
  );
  assert.equal(allowed.status, 200);
  assert.ok(allowed.headers.get('Set-Cookie'));
});

void test('expired bucket cleanup is bounded and preserves active counters', async () => {
  await db.batch(
    Array.from({ length: 150 }, (_, index) =>
      db
        .prepare(
          'INSERT INTO auth_rate_limits (bucket_key, request_count, expires_at) VALUES (?, 1, ?)',
        )
        .bind(`expired-${index}`, now - 1000),
    ),
  );
  await db
    .prepare(
      'INSERT INTO auth_rate_limits (bucket_key, request_count, expires_at) VALUES (?, 7, ?)',
    )
    .bind('active-test-bucket', now + 60_000)
    .run();
  assert.equal((await limit('otp_cooldown', recipient)).status, 'allowed');
  assert.equal(
    (
      await db
        .prepare(
          'SELECT count(*) AS total FROM auth_rate_limits WHERE expires_at <= ?',
        )
        .bind(now)
        .first()
    ).total,
    50,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT request_count FROM auth_rate_limits WHERE bucket_key = 'active-test-bucket'",
        )
        .first()
    ).request_count,
    7,
  );
});

void test('OTP verification counts concurrent wrong guesses atomically', async () => {
  const { challenge, code } = await startLogin();
  const wrong = code === '111111' ? '222222' : '111111';
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      post(
        '/api/auth/verify-login',
        { challenge, code: wrong },
        `192.0.2.${index + 1}`,
      ),
    ),
  );
  for (const response of responses) {
    assert.equal(response.headers.get('Set-Cookie'), null);
    await response.text();
  }
  const row = await db
    .prepare('SELECT status, attempt_count FROM auth_login_otps')
    .first();
  assert.equal(row.attempt_count, 5);
  assert.equal(row.status, 'revoked');
  const denied = await post('/api/auth/verify-login', { challenge, code });
  assert.equal(denied.headers.get('Set-Cookie'), null);
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM auth_sessions').first())
      .total,
    0,
  );
});

void test('valid OTP can create only one session and cannot be replayed', async () => {
  const { challenge, code } = await startLogin();
  const responses = await Promise.all([
    post('/api/auth/verify-login', { challenge, code }),
    post('/api/auth/verify-login', { challenge, code }),
  ]);
  assert.equal(
    responses.filter((response) => response.headers.has('Set-Cookie')).length,
    1,
  );
  for (const response of responses) await response.text();
  const replay = await post('/api/auth/verify-login', { challenge, code });
  assert.equal(replay.headers.get('Set-Cookie'), null);
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM auth_sessions').first())
      .total,
    1,
  );
});

void test('an expired OTP cannot produce a session', async () => {
  const { challenge, code } = await startLogin();
  await db
    .prepare('UPDATE auth_login_otps SET expires_at = ?')
    .bind(new Date(Date.now() - 1000).toISOString())
    .run();
  const response = await post('/api/auth/verify-login', { challenge, code });
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(
    (await destination(response)).searchParams.get('error'),
    'expired',
  );
});

void test('missing limiter migration fails closed without sending email or creating sessions', async () => {
  await db.prepare('DROP TABLE auth_rate_limits').run();
  try {
    const login = await post('/api/auth/login', { email: recipient, password });
    assert.equal(login.status, 503);
    assert.equal(login.headers.get('Set-Cookie'), null);
    const recovery = await post('/api/auth/forgot-password', {
      email: recipient,
    });
    assert.equal(recovery.status, 303);
    const verify = await post('/api/auth/verify-login', {
      challenge: 'x'.repeat(40),
      code: '123456',
    });
    assert.equal(verify.status, 503);
    assert.equal(verify.headers.get('Set-Cookie'), null);
    assert.equal(emails.length, 0);
  } finally {
    await applyMigration('0013_auth_rate_limits.sql');
  }
});
