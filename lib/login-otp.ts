import {
  createSessionToken,
  hashOptionalRequestValue,
  hashSessionToken,
} from './app-auth';
import {
  LOGIN_OTP_CODE_LENGTH,
  LOGIN_OTP_MAX_AGE_MINUTES,
} from './login-otp-utils';

export {
  cleanLoginOtpChallenge,
  cleanLoginOtpCode,
  LOGIN_OTP_CODE_LENGTH,
  LOGIN_OTP_MAX_AGE_MINUTES,
  LOGIN_OTP_MAX_ATTEMPTS,
  maskEmail,
} from './login-otp-utils';

export type LoginOtpChallenge = {
  challengeToken: string;
  code: string;
  expiresAt: string;
};

export async function createLoginOtpChallenge(
  db: D1Database,
  input: {
    email: string;
    ip: string | null;
    returnTo: string;
    userAgent: string | null;
    userId: string;
  },
): Promise<LoginOtpChallenge> {
  const now = new Date();
  const nowText = now.toISOString();
  const challengeToken = createSessionToken();
  const code = createLoginOtpCode();
  const expiresAt = new Date(
    now.getTime() + LOGIN_OTP_MAX_AGE_MINUTES * 60 * 1000,
  ).toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE auth_login_otps
         SET status = 'revoked'
         WHERE user_id = ?
           AND status = 'pending'`,
      )
      .bind(input.userId),
    db
      .prepare(
        `INSERT INTO auth_login_otps (
           id,
           user_id,
           email,
           challenge_token_hash,
           code_hash,
           return_to,
           status,
           attempt_count,
           user_agent_hash,
           ip_hash,
           expires_at,
           used_at,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.email,
        await hashSessionToken(challengeToken),
        await hashSessionToken(code),
        input.returnTo,
        await hashOptionalRequestValue(input.userAgent),
        await hashOptionalRequestValue(input.ip),
        expiresAt,
        nowText,
      ),
  ]);

  return {
    challengeToken,
    code,
    expiresAt,
  };
}

function createLoginOtpCode() {
  const max = 4_294_000_000;
  const random = new Uint32Array(1);

  do {
    crypto.getRandomValues(random);
  } while (random[0] >= max);

  return String(random[0] % 1_000_000).padStart(LOGIN_OTP_CODE_LENGTH, '0');
}
