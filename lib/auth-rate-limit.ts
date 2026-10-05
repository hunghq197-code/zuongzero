import { isIP } from 'node:net';

import { hashSessionToken } from './app-auth';

export const AUTH_RATE_POLICIES = {
  login_ip: { limit: 60, windowSeconds: 900 },
  login_account: { limit: 10, windowSeconds: 900 },
  otp_ip: { limit: 30, windowSeconds: 900 },
  otp_cooldown: { limit: 1, windowSeconds: 60 },
  otp_hourly: { limit: 10, windowSeconds: 3600 },
  recovery_ip: { limit: 20, windowSeconds: 900 },
  recovery_cooldown: { limit: 1, windowSeconds: 60 },
  recovery_account: { limit: 3, windowSeconds: 3600 },
  verify_ip: { limit: 60, windowSeconds: 900 },
} as const;

export type AuthRatePolicy = keyof typeof AUTH_RATE_POLICIES;
export type AuthRateLimitResult =
  | { status: 'allowed' }
  | { status: 'blocked'; retryAfterSeconds: number }
  | { status: 'unavailable' };

type RateLimitRow = { expiresAt: number };

export function authRequestIp(request: Request) {
  const ip = request.headers.get('cf-connecting-ip')?.trim().toLowerCase();
  return ip && isIP(ip) ? ip : 'unknown';
}

export async function consumeAuthRateLimit(
  db: D1Database,
  policy: AuthRatePolicy,
  identifier: string,
  now = Date.now(),
): Promise<AuthRateLimitResult> {
  try {
    const { limit, windowSeconds } = AUTH_RATE_POLICIES[policy];
    const key = await hashSessionToken(`auth-rate:${policy}:${identifier}`);

    // Conditional UPSERT reserves a slot atomically across Worker instances.
    const results = await db.batch<RateLimitRow>([
      db
        .prepare(
          `DELETE FROM auth_rate_limits
           WHERE bucket_key IN (
             SELECT bucket_key FROM auth_rate_limits
             WHERE expires_at <= ?
             ORDER BY expires_at
             LIMIT 100
           )`,
        )
        .bind(now),
      db
        .prepare(
          `INSERT INTO auth_rate_limits (bucket_key, request_count, expires_at)
           VALUES (?, 1, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET
             request_count = CASE
               WHEN auth_rate_limits.expires_at <= ? THEN 1
               ELSE auth_rate_limits.request_count + 1
             END,
             expires_at = CASE
               WHEN auth_rate_limits.expires_at <= ? THEN excluded.expires_at
               ELSE auth_rate_limits.expires_at
             END
           WHERE auth_rate_limits.expires_at <= ?
              OR auth_rate_limits.request_count < ?
           RETURNING expires_at AS expiresAt`,
        )
        .bind(key, now + windowSeconds * 1000, now, now, now, limit),
      db
        .prepare(
          `SELECT expires_at AS expiresAt
           FROM auth_rate_limits WHERE bucket_key = ?`,
        )
        .bind(key),
    ]);

    if (results[1].results.length === 1) return { status: 'allowed' };

    const expiresAt = results[2].results[0]?.expiresAt;
    if (!Number.isFinite(expiresAt))
      throw new Error('Missing rate limit state');

    return {
      status: 'blocked',
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    };
  } catch {
    // A missing migration or unavailable database must not disable protection.
    console.error('[auth-rate-limit] unavailable', {
      errorId: crypto.randomUUID(),
      policy,
    });
    return { status: 'unavailable' };
  }
}
