import { env } from 'cloudflare:workers';

import {
  hashSessionToken,
  safeRelativeReturnPath,
  verifyPassword,
  verifyPlainSecret,
} from '@/lib/app-auth';
import { getConfiguredSuperAdminEmails } from '@/lib/admin-auth';
import {
  authRequestIp,
  consumeAuthRateLimit,
  type AuthRateLimitResult,
} from '@/lib/auth-rate-limit';
import { loginOtpDeliveryMessage, sendLoginOtpEmail } from '@/lib/email';
import {
  accountUserIdForEmail,
  cleanText,
  isValidEmail,
  normalizeEmail,
} from '@/lib/identity';
import { createLoginOtpChallenge } from '@/lib/login-otp';
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
  if (!env.DB) {
    return redirectToLogin(request, 'config', '', '/');
  }

  const ip = authRequestIp(request);
  const ipLimit = await consumeAuthRateLimit(env.DB, 'login_ip', ip);
  if (ipLimit.status !== 'allowed') {
    return rateLimitLoginResponse(request, ipLimit, '', '/');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectToLogin(request, 'invalid', '', '/');
  }
  const email = normalizeEmail(cleanText(formData.get('email'), 254));
  const password = readPassword(formData.get('password'));
  const returnTo = safeRelativeReturnPath(readText(formData.get('return_to')));

  if (!isValidEmail(email) || !password) {
    return redirectToLogin(request, 'invalid', email, returnTo);
  }

  const accountLimit = await consumeAuthRateLimit(env.DB, 'login_account', email);
  if (accountLimit.status !== 'allowed') {
    return rateLimitLoginResponse(request, accountLimit, email, returnTo);
  }

  const authenticatedUser = await authenticateUser(email, password);
  if (!authenticatedUser) {
    return redirectToLogin(request, 'invalid', email, returnTo);
  }

  for (const policy of ['otp_ip', 'otp_cooldown', 'otp_hourly'] as const) {
    const limit = await consumeAuthRateLimit(
      env.DB,
      policy,
      policy === 'otp_ip' ? ip : email,
    );
    if (limit.status !== 'allowed') {
      return rateLimitLoginResponse(request, limit, email, returnTo);
    }
  }

  const challenge = await createLoginOtpChallenge(env.DB, {
    email: authenticatedUser.email,
    ip: request.headers.get('cf-connecting-ip'),
    returnTo,
    userAgent: request.headers.get('user-agent'),
    userId: authenticatedUser.id,
  });
  const delivery = await sendLoginOtpEmail({
    code: challenge.code,
    displayName: authenticatedUser.displayName,
    email: authenticatedUser.email,
    expiresAt: challenge.expiresAt,
  });

  if (delivery.status !== 'sent') {
    await revokeLoginOtpChallenge(challenge.challengeToken);
    console.error('[login-otp] delivery failed', {
      delivery: loginOtpDeliveryMessage(delivery),
      userId: authenticatedUser.id,
    });
    return redirectToLogin(request, 'otp_delivery', email, returnTo);
  }

  console.info('[login-otp] challenge sent', {
    userId: authenticatedUser.id,
  });

  const verifyUrl = new URL('/login/verify', request.url);
  verifyUrl.searchParams.set('challenge', challenge.challengeToken);

  return navigationResponse(verifyUrl);
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

    const user = await ensureUserRecord(env.DB, {
      displayName: 'Super admin',
      email,
      lastSeenAt: new Date().toISOString(),
      role: 'super_admin',
      userId: accountUserIdForEmail(email),
    });

    return {
      ...user,
      displayName: 'Super admin',
    };
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

function redirectToLogin(
  request: Request,
  error: 'config' | 'invalid' | 'otp_delivery' | 'rate_limited' | 'temporary',
  email: string,
  returnTo: string,
  retryAfterSeconds?: number,
) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  if (email) url.searchParams.set('email', email);
  if (returnTo !== '/') url.searchParams.set('return_to', returnTo);
  if (retryAfterSeconds) {
    url.searchParams.set('retry_after', String(retryAfterSeconds));
  }

  const response = navigationResponse(url);
  if (error === 'rate_limited') {
    return new Response(response.body, {
      status: 429,
      headers: {
        ...Object.fromEntries(response.headers),
        'Retry-After': String(retryAfterSeconds),
      },
    });
  }
  if (error === 'temporary') {
    return new Response(response.body, { status: 503, headers: response.headers });
  }
  return response;
}

function rateLimitLoginResponse(
  request: Request,
  limit: Exclude<AuthRateLimitResult, { status: 'allowed' }>,
  email: string,
  returnTo: string,
) {
  return redirectToLogin(
    request,
    limit.status === 'blocked' ? 'rate_limited' : 'temporary',
    email,
    returnTo,
    limit.status === 'blocked' ? limit.retryAfterSeconds : undefined,
  );
}

async function revokeLoginOtpChallenge(challengeToken: string) {
  await env.DB.prepare(
    `UPDATE auth_login_otps
     SET status = 'revoked'
     WHERE challenge_token_hash = ?
       AND status = 'pending'`,
  )
    .bind(await hashSessionToken(challengeToken))
    .run();
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
