import { env } from 'cloudflare:workers';

import {
  buildExpiredSessionCookie,
  hashSessionToken,
  readCookie,
  safeRelativeReturnPath,
  SESSION_COOKIE_NAME,
} from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get('return_to'),
  );

  if (token && env.DB) {
    await env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE token_hash = ?`,
    )
      .bind(await hashSessionToken(token))
      .run();
  }

  return new Response(null, {
    headers: {
      Location: returnTo,
      'Set-Cookie': buildExpiredSessionCookie(request.url),
    },
    status: 303,
  });
}
