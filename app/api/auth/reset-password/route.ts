import { env } from 'cloudflare:workers';

import {
  buildExpiredSessionCookie,
  createPasswordHash,
  isValidPassword,
} from '@/lib/app-auth';
import {
  cleanInviteToken,
  readAccountInviteByToken,
} from '@/lib/account-invites';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!env.DB) {
    return redirectToReset(request, 'config');
  }

  const formData = await request.formData();
  const token = cleanInviteToken(formData.get('token'));
  const password = readPassword(formData.get('password'));
  const confirmPassword = readPassword(formData.get('confirm_password'));

  if (!token) {
    return redirectToReset(request, 'invalid');
  }

  const invite = await readAccountInviteByToken(env.DB, token);
  if (!invite || invite.purpose !== 'password_reset') {
    return redirectToReset(request, 'invalid', token);
  }

  if (invite.status !== 'pending') {
    return redirectToReset(request, invite.status, token);
  }

  if (!isValidPassword(password)) {
    return redirectToReset(request, 'password_length', token);
  }

  if (password !== confirmPassword) {
    return redirectToReset(request, 'password_match', token);
  }

  const now = new Date().toISOString();
  const passwordHash = await createPasswordHash(password);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO password_credentials (
         id,
         user_id,
         password_hash,
         password_updated_at,
         must_change_password,
         created_at
       )
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         password_updated_at = excluded.password_updated_at,
         must_change_password = 0`,
    ).bind(crypto.randomUUID(), invite.userId, passwordHash, now, now),
    env.DB.prepare(
      `UPDATE account_invites
       SET status = 'used',
           used_at = ?
       WHERE id = ?
         AND purpose = 'password_reset'
         AND status = 'pending'`,
    ).bind(now, invite.id),
    env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE user_id = ?`,
    ).bind(invite.userId),
  ]);

  const url = new URL('/login', request.url);
  url.searchParams.set('reset', 'changed');

  return new Response(null, {
    headers: {
      Location: url.pathname + url.search,
      'Set-Cookie': buildExpiredSessionCookie(request.url),
    },
    status: 303,
  });
}

function redirectToReset(
  request: Request,
  error:
    | 'config'
    | 'invalid'
    | 'expired'
    | 'used'
    | 'revoked'
    | 'password_length'
    | 'password_match',
  token?: string,
) {
  const url = new URL('/reset-password', request.url);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('error', error);

  return Response.redirect(url, 303);
}

function readPassword(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 200);
}
