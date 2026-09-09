import { env } from 'cloudflare:workers';

import {
  buildSessionCookie,
  createSessionToken,
  hashOptionalRequestValue,
  hashSessionToken,
  safeRelativeReturnPath,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
  verifyPlainSecret,
} from '@/lib/app-auth';
import { getConfiguredSuperAdminEmails } from '@/lib/admin-auth';
import {
  accountUserIdForEmail,
  cleanText,
  isValidEmail,
  normalizeEmail,
} from '@/lib/identity';
import { ensureUserRecord, type AppUserRole } from '@/lib/user-records';

type StoredCredentialRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: AppUserRole;
  passwordHash: string;
};

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get('return_to'),
  );
  const url = new URL('/login', request.url);
  if (returnTo !== '/') url.searchParams.set('return_to', returnTo);

  return navigationResponse(url);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = normalizeEmail(cleanText(formData.get('email'), 254));
  const password = readPassword(formData.get('password'));
  const returnTo = safeRelativeReturnPath(readText(formData.get('return_to')));

  if (!env.DB) {
    return redirectToLogin(request, 'config', email, returnTo);
  }

  if (!isValidEmail(email) || !password) {
    return redirectToLogin(request, 'invalid', email, returnTo);
  }

  const authenticatedUser = await authenticateUser(email, password);
  if (!authenticatedUser) {
    return redirectToLogin(request, 'invalid', email, returnTo);
  }

  const now = new Date();
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_sessions (
         id,
         user_id,
         token_hash,
         user_agent_hash,
         ip_hash,
         created_at,
         last_seen_at,
         expires_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      sessionId,
      authenticatedUser.id,
      tokenHash,
      await hashOptionalRequestValue(request.headers.get('user-agent')),
      await hashOptionalRequestValue(request.headers.get('cf-connecting-ip')),
      now.toISOString(),
      now.toISOString(),
      expiresAt,
    ),
    env.DB.prepare(
      `UPDATE users
       SET last_seen_at = ?
       WHERE id = ?`,
    ).bind(now.toISOString(), authenticatedUser.id),
  ]);

  await pruneExpiredSessions(now.toISOString());

  const destination = resolveDestination(returnTo, authenticatedUser.role);
  const response = navigationResponse(new URL(destination, request.url));
  response.headers.append('Set-Cookie', buildSessionCookie(token, request.url));

  return response;
}

async function authenticateUser(email: string, password: string) {
  const superAdminEmails = getConfiguredSuperAdminEmails();

  if (superAdminEmails.includes(email)) {
    const configuredPassword = env.SUPER_ADMIN_PASSWORD;
    if (
      !configuredPassword ||
      !(await verifyPlainSecret(password, configuredPassword))
    ) {
      return null;
    }

    return ensureUserRecord(env.DB, {
      displayName: 'Super admin',
      email,
      lastSeenAt: new Date().toISOString(),
      role: 'super_admin',
      userId: accountUserIdForEmail(email),
    });
  }

  const storedUser = await env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.display_name AS displayName,
       u.role,
       pc.password_hash AS passwordHash
     FROM users u
     JOIN password_credentials pc ON pc.user_id = u.id
     WHERE lower(u.email) = ?
       AND u.status = 'active'
       AND u.role IN ('admin', 'client')
     LIMIT 1`,
  )
    .bind(email)
    .first<StoredCredentialRow>();

  if (!storedUser) return null;
  if (!(await verifyPassword(password, storedUser.passwordHash))) return null;

  return storedUser;
}

async function pruneExpiredSessions(now: string) {
  await env.DB.prepare(
    `DELETE FROM auth_sessions
     WHERE expires_at <= ?`,
  )
    .bind(now)
    .run();
}

function resolveDestination(returnTo: string, role: AppUserRole) {
  if (returnTo !== '/') return returnTo;
  if (role === 'super_admin' || role === 'admin') return '/admin';

  return '/';
}

function redirectToLogin(
  request: Request,
  error: 'config' | 'invalid',
  email: string,
  returnTo: string,
) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  if (email) url.searchParams.set('email', email);
  if (returnTo !== '/') url.searchParams.set('return_to', returnTo);

  return navigationResponse(url);
}

function readText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function readPassword(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 200);
}

function navigationResponse(destination: URL) {
  const target = destination.pathname + destination.search + destination.hash;

  return new Response(
    `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
    <script>location.replace(${JSON.stringify(target)});</script>
    <title>Đăng nhập</title>
  </head>
  <body>
    <a href="${escapeHtml(target)}">Đăng nhập</a>
  </body>
</html>`,
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
      },
      status: 200,
    },
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
