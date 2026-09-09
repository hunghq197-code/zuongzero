import { env } from 'cloudflare:workers';

import {
  buildSessionCookie,
  createPasswordHash,
  createSessionToken,
  hashOptionalRequestValue,
  hashSessionToken,
  isValidPassword,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/app-auth';
import {
  cleanInviteToken,
  readAccountInviteByToken,
} from '@/lib/account-invites';
import { cleanText } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!env.DB) {
    return redirectToSetup(request, 'config');
  }

  const formData = await request.formData();
  const token = cleanInviteToken(formData.get('token'));
  const password = readPassword(formData.get('password'));
  const confirmPassword = readPassword(formData.get('confirm_password'));
  const displayName = cleanText(formData.get('display_name'), 160);
  const companyName = cleanText(formData.get('company_name'), 160);
  const phone = cleanText(formData.get('phone'), 40);

  if (!token) {
    return redirectToSetup(request, 'invalid');
  }

  const invite = await readAccountInviteByToken(env.DB, token);
  if (!invite || invite.purpose !== 'account_activation') {
    return redirectToSetup(request, 'invalid', token);
  }

  if (invite.status !== 'pending') {
    return redirectToSetup(request, invite.status, token);
  }

  if (!isValidPassword(password)) {
    return redirectToSetup(request, 'password_length', token);
  }

  if (password !== confirmPassword) {
    return redirectToSetup(request, 'password_match', token);
  }

  const now = new Date();
  const nowText = now.toISOString();
  const passwordHash = await createPasswordHash(password);
  const sessionToken = createSessionToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET display_name = ?,
           company_name = ?,
           phone = ?,
           status = 'active',
           last_seen_at = ?
       WHERE id = ?`,
    ).bind(
      displayName || invite.displayName,
      companyName || invite.companyName,
      phone || invite.phone,
      nowText,
      invite.userId,
    ),
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
    ).bind(crypto.randomUUID(), invite.userId, passwordHash, nowText, nowText),
    env.DB.prepare(
      `UPDATE account_invites
       SET status = 'used',
           used_at = ?
       WHERE id = ?
         AND status = 'pending'`,
    ).bind(nowText, invite.id),
    env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE user_id = ?`,
    ).bind(invite.userId),
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
      invite.userId,
      await hashSessionToken(sessionToken),
      await hashOptionalRequestValue(request.headers.get('user-agent')),
      await hashOptionalRequestValue(request.headers.get('cf-connecting-ip')),
      nowText,
      nowText,
      expiresAt,
    ),
  ]);

  const returnTo =
    invite.role === 'admin' || invite.role === 'super_admin' ? '/admin' : '/';
  return new Response(null, {
    headers: {
      Location: returnTo,
      'Set-Cookie': buildSessionCookie(sessionToken, request.url),
    },
    status: 303,
  });
}

function redirectToSetup(
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
  const url = new URL('/setup-account', request.url);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('error', error);

  return Response.redirect(url, 303);
}

function readPassword(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 200);
}
