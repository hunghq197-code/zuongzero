import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readHeaderIdentity, type HeaderIdentity } from '@/lib/header-identity';

import {
  buildExpiredSessionCookie,
  hashSessionToken,
  readCookie,
  safeRelativeReturnPath,
  SESSION_COOKIE_NAME,
} from '@/lib/app-auth';

export type ChatGPTUser = HeaderIdentity;

type SessionUserRow = {
  userId: string;
  email: string;
  displayName: string | null;
};

type HeaderReader = {
  get(name: string): string | null;
};

export async function getChatGPTUser(
  sourceHeaders?: HeaderReader,
): Promise<ChatGPTUser | null> {
  const requestHeaders = sourceHeaders ?? (await headers());
  const sessionToken = readCookie(
    requestHeaders.get('cookie'),
    SESSION_COOKIE_NAME,
  );

  if (sessionToken && env.DB) {
    const sessionUser = await readSessionUser(sessionToken);
    if (sessionUser) return sessionUser;
  }

  return readHeaderIdentity(requestHeaders, env.AUTH_PROVIDER);
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/login?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/api/auth/logout?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function authProviderName() {
  return 'Zuong Zero Artist Portal account';
}

async function readSessionUser(token: string): Promise<ChatGPTUser | null> {
  const tokenHash = await hashSessionToken(token);
  const now = new Date().toISOString();

  try {
    const row = await env.DB.prepare(
      `SELECT
         u.id AS userId,
         u.email,
         u.display_name AS displayName
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.expires_at > ?
         AND u.status = 'active'
       LIMIT 1`,
    )
      .bind(tokenHash, now)
      .first<SessionUserRow>();

    if (!row) return null;

    return {
      userId: row.userId,
      displayName: row.displayName ?? row.email,
      email: row.email,
      fullName: row.displayName,
    };
  } catch {
    return null;
  }
}

export { buildExpiredSessionCookie };
