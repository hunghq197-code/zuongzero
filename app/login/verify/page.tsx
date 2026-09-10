/* eslint-disable next/no-html-link-for-pages */
import { env } from 'cloudflare:workers';
import { ArrowLeft, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react';

import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { hashSessionToken } from '@/lib/app-auth';
import {
  cleanLoginOtpChallenge,
  LOGIN_OTP_CODE_LENGTH,
  LOGIN_OTP_MAX_AGE_MINUTES,
  maskEmail,
} from '@/lib/login-otp';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
type LoginOtpPreview = {
  email: string;
  expiresAt: string;
  status: 'pending' | 'used' | 'revoked';
};

export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const challenge = cleanLoginOtpChallenge(
    readSearchParam(params, 'challenge'),
  );
  const errorMessage = resolveOtpError(readSearchParam(params, 'error'));
  const otp = challenge ? await readOtpPreview(challenge) : null;
  const canSubmit = otp?.status === 'pending';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="bg-[#071118] p-6 text-white md:p-8">
          <BrandMark />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            Login verification
          </p>
          <h1 className="font-display mt-4 text-3xl font-semibold">
            Xác thực mã OTP
          </h1>
          <EqualizerBars className="mt-10" />
        </div>

        <div className="p-5 md:p-8">
          <div className="flex size-11 items-center justify-center rounded-lg bg-[#e7fbf7] text-[#00796f]">
            <MailCheck className="size-5" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold md:text-3xl">
            Nhập mã trong email
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Mã OTP 6 số đã được gửi đến{' '}
            <span className="font-medium text-foreground">
              {otp ? maskEmail(otp.email) : 'email đăng nhập'}
            </span>
            . Mã có hiệu lực {LOGIN_OTP_MAX_AGE_MINUTES} phút.
          </p>

          {errorMessage ? (
            <p className="mt-5 rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
              {errorMessage}
            </p>
          ) : null}

          {!canSubmit ? (
            <div className="mt-6 rounded-lg border border-border bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LockKeyhole className="size-4 text-primary" />
                Mã OTP không còn hiệu lực
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Hãy quay lại trang đăng nhập để nhận mã mới.
              </p>
            </div>
          ) : (
            <form
              action="/api/auth/verify-login"
              className="mt-6 grid gap-5"
              method="post"
            >
              <input name="challenge" type="hidden" value={challenge} />

              <div className="space-y-3">
                <label className="block text-sm font-medium" htmlFor="code">
                  Mã OTP
                </label>
                <InputOTP
                  autoComplete="one-time-code"
                  containerClassName="justify-start"
                  id="code"
                  maxLength={LOGIN_OTP_CODE_LENGTH}
                  name="code"
                  pattern="\d*"
                  required
                >
                  <InputOTPGroup className="gap-2">
                    {Array.from({ length: LOGIN_OTP_CODE_LENGTH }).map(
                      (_, index) => (
                        <InputOTPSlot
                          className="h-12 w-11 rounded-lg border-l bg-white text-lg font-semibold"
                          index={index}
                          key={index}
                        />
                      ),
                    )}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button className="h-11 w-full" type="submit">
                <ShieldCheck className="size-4" />
                Xác nhận đăng nhập
              </Button>
            </form>
          )}

          <a
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
            href="/login"
          >
            <ArrowLeft className="size-4" />
            Quay lại đăng nhập
          </a>
        </div>
      </section>
    </main>
  );
}

async function readOtpPreview(challengeToken: string) {
  if (!env.DB) return null;

  return env.DB.prepare(
    `SELECT
       email,
       status,
       expires_at AS expiresAt
     FROM auth_login_otps
     WHERE challenge_token_hash = ?
     LIMIT 1`,
  )
    .bind(await hashSessionToken(challengeToken))
    .first<LoginOtpPreview>();
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveOtpError(error: string | null) {
  if (error === 'config') return 'Dịch vụ xác thực chưa sẵn sàng.';
  if (error === 'expired') return 'Mã OTP đã hết hạn. Vui lòng đăng nhập lại.';
  if (error === 'invalid') return 'Mã OTP không đúng.';
  if (error === 'locked') {
    return 'Bạn đã nhập sai quá số lần cho phép. Vui lòng đăng nhập lại để nhận mã mới.';
  }
  if (error === 'revoked' || error === 'used') {
    return 'Mã OTP này không còn hiệu lực. Vui lòng đăng nhập lại.';
  }

  return null;
}
