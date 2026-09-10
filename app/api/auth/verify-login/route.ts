import { env } from 'cloudflare:workers';

import {
  buildSessionCookie,
  createSessionToken,
  hashOptionalRequestValue,
  hashSessionToken,
  safeRelativeReturnPath,
  SESSION_MAX_AGE_SECONDS,
  verifyPlainSecret,
} from '@/lib/app-auth';
import {
  cleanLoginOtpChallenge,
  cleanLoginOtpCode,
  LOGIN_OTP_MAX_ATTEMPTS,
} from '@/lib/login-otp';
import type { AppUserRole } from '@/lib/user-records';

type StoredLoginOtpRow = {
  attemptCount: number;
  codeHash: string;
  email: string;
  expiresAt: string;
  id: string;
  returnTo: string;
  role: AppUserRole;
  status: 'pending' | 'used' | 'revoked';
  userId: string;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!env.DB) {
    return redirectToVerify(request, 'config');
  }

  const formData = await request.formData();
  const challenge = cleanLoginOtpChallenge(formData.get('challenge'));
  const code = cleanLoginOtpCode(formData.get('code'));

  if (!challenge || code.length !== 6) {
    return redirectToVerify(request, 'invalid', challenge);
  }

  const otp = await readLoginOtp(challenge);
  if (!otp) {
    return redirectToVerify(request, 'invalid', challenge);
  }

  if (otp.status !== 'pending') {
    return redirectToVerify(request, otp.status, challenge);
  }

  const now = new Date();
  const nowText = now.toISOString();
  if (new Date(otp.expiresAt).getTime() <= now.getTime()) {
    await revokeLoginOtp(otp.id);
    return redirectToVerify(request, 'expired', challenge);
  }

  const submittedCodeHash = await hashSessionToken(code);
  const codeMatches = await verifyPlainSecret(submittedCodeHash, otp.codeHash);
  if (!codeMatches) {
    const nextAttemptCount = Number(otp.attemptCount || 0) + 1;
    if (nextAttemptCount >= LOGIN_OTP_MAX_ATTEMPTS) {
      await revokeLoginOtp(otp.id, nextAttemptCount);
      return redirectToVerify(request, 'locked', challenge);
    }

    await incrementLoginOtpAttempt(otp.id, nextAttemptCount);
    return redirectToVerify(request, 'invalid', challenge);
  }

  const sessionToken = createSessionToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  const consumeResult = await env.DB.prepare(
    `UPDATE auth_login_otps
     SET status = 'used',
         used_at = ?
     WHERE id = ?
       AND status = 'pending'`,
  )
    .bind(nowText, otp.id)
    .run();

  if (consumeResult.meta.changes !== 1) {
    return redirectToVerify(request, 'used', challenge);
  }

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
      otp.userId,
      await hashSessionToken(sessionToken),
      await hashOptionalRequestValue(request.headers.get('user-agent')),
      await hashOptionalRequestValue(request.headers.get('cf-connecting-ip')),
      nowText,
      nowText,
      expiresAt,
    ),
    env.DB.prepare(
      `UPDATE users
       SET last_seen_at = ?
       WHERE id = ?`,
    ).bind(nowText, otp.userId),
    env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE expires_at <= ?`,
    ).bind(nowText),
    env.DB.prepare(
      `UPDATE auth_login_otps
       SET status = 'revoked'
       WHERE status = 'pending'
         AND expires_at <= ?`,
    ).bind(nowText),
  ]);

  const destination = resolveDestination(
    safeRelativeReturnPath(otp.returnTo),
    otp.role,
  );
  const response = navigationResponse(new URL(destination, request.url));
  response.headers.append(
    'Set-Cookie',
    buildSessionCookie(sessionToken, request.url),
  );

  return response;
}

async function readLoginOtp(challengeToken: string) {
  return env.DB.prepare(
    `SELECT
       lo.id,
       lo.user_id AS userId,
       lo.email,
       lo.code_hash AS codeHash,
       lo.return_to AS returnTo,
       lo.status,
       lo.attempt_count AS attemptCount,
       lo.expires_at AS expiresAt,
       u.role
     FROM auth_login_otps lo
     JOIN users u
       ON u.id = lo.user_id
     WHERE lo.challenge_token_hash = ?
       AND u.status = 'active'
     LIMIT 1`,
  )
    .bind(await hashSessionToken(challengeToken))
    .first<StoredLoginOtpRow>();
}

async function revokeLoginOtp(id: string, attemptCount?: number) {
  await env.DB.prepare(
    `UPDATE auth_login_otps
     SET status = 'revoked',
         attempt_count = COALESCE(?, attempt_count)
     WHERE id = ?`,
  )
    .bind(attemptCount ?? null, id)
    .run();
}

async function incrementLoginOtpAttempt(id: string, attemptCount: number) {
  await env.DB.prepare(
    `UPDATE auth_login_otps
     SET attempt_count = ?
     WHERE id = ?
       AND status = 'pending'`,
  )
    .bind(attemptCount, id)
    .run();
}

function resolveDestination(returnTo: string, role: AppUserRole) {
  if (returnTo !== '/') return returnTo;
  if (role === 'super_admin' || role === 'admin') return '/admin';

  return '/';
}

function redirectToVerify(
  request: Request,
  error: 'config' | 'expired' | 'invalid' | 'locked' | 'revoked' | 'used',
  challenge?: string,
) {
  const url = new URL('/login/verify', request.url);
  if (challenge) url.searchParams.set('challenge', challenge);
  url.searchParams.set('error', error);

  return navigationResponse(url);
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
    <title>Xác thực OTP</title>
  </head>
  <body>
    <a href="${escapeHtml(target)}">Xác thực OTP</a>
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
