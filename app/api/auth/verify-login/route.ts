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
import { authRequestIp, consumeAuthRateLimit } from '@/lib/auth-rate-limit';
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectToVerify(request, 'invalid');
  }
  const challenge = cleanLoginOtpChallenge(formData.get('challenge'));
  const code = cleanLoginOtpCode(formData.get('code'));

  const ipLimit = await consumeAuthRateLimit(
    env.DB,
    'verify_ip',
    authRequestIp(request),
  );
  if (ipLimit.status !== 'allowed') {
    return redirectToVerify(
      request,
      ipLimit.status === 'blocked' ? 'rate_limited' : 'config',
      challenge,
      ipLimit.status === 'blocked' ? ipLimit.retryAfterSeconds : undefined,
      ipLimit.status === 'blocked' ? 429 : 503,
    );
  }

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

  const reservedAttempt = await env.DB.prepare(
    `UPDATE auth_login_otps
     SET attempt_count = attempt_count + 1
     WHERE id = ?
       AND status = 'pending'
       AND expires_at > ?
       AND attempt_count < ?
     RETURNING attempt_count AS attemptCount`,
  )
    .bind(otp.id, nowText, LOGIN_OTP_MAX_ATTEMPTS)
    .first<{ attemptCount: number }>();
  if (!reservedAttempt) {
    return redirectToVerify(request, 'locked', challenge);
  }

  const submittedCodeHash = await hashSessionToken(code);
  const codeMatches = await verifyPlainSecret(submittedCodeHash, otp.codeHash);
  if (!codeMatches) {
    if (reservedAttempt.attemptCount >= LOGIN_OTP_MAX_ATTEMPTS) {
      await revokeLoginOtp(otp.id);
      return redirectToVerify(request, 'locked', challenge);
    }

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
       AND status = 'pending'
       AND expires_at > ?`,
  )
    .bind(nowText, otp.id, new Date().toISOString())
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

async function revokeLoginOtp(id: string) {
  await env.DB.prepare(
    `UPDATE auth_login_otps
     SET status = 'revoked'
     WHERE id = ?
       AND status = 'pending'`,
  )
    .bind(id)
    .run();
}

function resolveDestination(returnTo: string, role: AppUserRole) {
  if (returnTo !== '/') return returnTo;
  if (role === 'super_admin' || role === 'admin') return '/admin';

  return '/';
}

function redirectToVerify(
  request: Request,
  error:
    | 'config'
    | 'expired'
    | 'invalid'
    | 'locked'
    | 'revoked'
    | 'used'
    | 'rate_limited',
  challenge?: string,
  retryAfterSeconds?: number,
  status = 200,
) {
  const url = new URL('/login/verify', request.url);
  if (challenge) url.searchParams.set('challenge', challenge);
  url.searchParams.set('error', error);
  if (retryAfterSeconds) {
    url.searchParams.set('retry_after', String(retryAfterSeconds));
  }

  const response = navigationResponse(url);
  if (retryAfterSeconds) {
    response.headers.set('Retry-After', String(retryAfterSeconds));
  }
  return new Response(response.body, { status, headers: response.headers });
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
