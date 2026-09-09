import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getConfiguredSuperAdminEmails } from '@/lib/admin-auth';
import {
  createPasswordHash,
  hashSessionToken,
  isValidPassword,
  readCookie,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from '@/lib/app-auth';

type StoredCredentialRow = {
  id: string;
  passwordHash: string;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(
      new URL('/login?return_to=%2Faccount', request.url),
      303,
    );
  }

  if (getConfiguredSuperAdminEmails().includes(user.email.toLowerCase())) {
    return redirectToAccount(request, 'managed');
  }

  if (!env.DB) {
    return redirectToAccount(request, 'config');
  }

  const formData = await request.formData();
  const currentPassword = readPassword(formData.get('current_password'));
  const newPassword = readPassword(formData.get('new_password'));
  const confirmPassword = readPassword(formData.get('confirm_password'));

  if (!isValidPassword(newPassword)) {
    return redirectToAccount(request, 'password_length');
  }

  if (newPassword !== confirmPassword) {
    return redirectToAccount(request, 'password_match');
  }

  const credential = await env.DB.prepare(
    `SELECT
       pc.id,
       pc.password_hash AS passwordHash
     FROM users u
     JOIN password_credentials pc
       ON pc.user_id = u.id
     WHERE lower(u.email) = ?
       AND u.status = 'active'
     LIMIT 1`,
  )
    .bind(user.email.trim().toLowerCase())
    .first<StoredCredentialRow>();

  if (
    !credential ||
    !(await verifyPassword(currentPassword, credential.passwordHash))
  ) {
    return redirectToAccount(request, 'current_invalid');
  }

  const now = new Date().toISOString();
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  const tokenHash = token ? await hashSessionToken(token) : null;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE password_credentials
       SET password_hash = ?,
           password_updated_at = ?,
           must_change_password = 0
       WHERE id = ?`,
    ).bind(await createPasswordHash(newPassword), now, credential.id),
    env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE user_id = ?
         AND (? IS NULL OR token_hash != ?)`,
    ).bind(user.userId, tokenHash, tokenHash),
  ]);

  return redirectToAccount(request, 'changed');
}

function redirectToAccount(
  request: Request,
  password:
    | 'changed'
    | 'config'
    | 'current_invalid'
    | 'managed'
    | 'password_length'
    | 'password_match',
) {
  const url = new URL('/account', request.url);
  url.searchParams.set('password', password);
  return Response.redirect(url, 303);
}

function readPassword(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 200);
}
