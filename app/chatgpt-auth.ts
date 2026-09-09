import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  buildExpiredSessionCookie,
  hashSessionToken,
  readCookie,
  safeRelativeReturnPath,
  SESSION_COOKIE_NAME,
} from '@/lib/app-auth';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';
const CLOUDFLARE_ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

type SessionUserRow = {
  userId: string;
  email: string;
  displayName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const sessionToken = readCookie(
    requestHeaders.get('cookie'),
    SESSION_COOKIE_NAME,
  );

  if (sessionToken && env.DB) {
    const sessionUser = await readSessionUser(sessionToken);
    if (sessionUser) return sessionUser;
  }

  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  const accessEmail = requestHeaders.get(CLOUDFLARE_ACCESS_EMAIL_HEADER);

  if (userId && email) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) ===
        PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;

    return {
      userId,
      displayName: fullName ?? email,
      email,
      fullName,
    };
  }

  if (isCloudflareAccessAuth() && accessEmail) {
    const normalizedEmail = accessEmail.trim().toLowerCase();

    return {
      userId: `cloudflare-access:${normalizedEmail}`,
      displayName: normalizedEmail,
      email: normalizedEmail,
      fullName: null,
    };
  }

  return null;
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
  return 'Dashboard account';
}

function isCloudflareAccessAuth() {
  return env.AUTH_PROVIDER === 'cloudflare-access';
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
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
