/* eslint-disable next/no-html-link-for-pages */
import { env } from 'cloudflare:workers';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';

import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  cleanInviteToken,
  readAccountInviteByToken,
  type AccountInviteDetails,
} from '@/lib/account-invites';
import { PASSWORD_MIN_LENGTH } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const token = cleanInviteToken(readSearchParam(params, 'token'));
  const invite =
    env.DB && token ? await readAccountInviteByToken(env.DB, token) : null;
  const pageError = resetErrorMessage(readSearchParam(params, 'error'));
  const canReset =
    invite?.purpose === 'password_reset' && invite.status === 'pending';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="bg-[#071118] p-6 text-white md:p-8">
          <BrandMark />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            Password reset
          </p>
          <h1 className="font-display mt-4 text-3xl font-semibold">
            Zuong Zero Artist Portal
          </h1>
          <EqualizerBars className="mt-10" />
        </div>

        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#e7fbf7] text-[#00796f]">
              <KeyRound className="size-5" />
            </div>
            <Badge className="rounded-lg" variant="outline">
              {canReset ? 'Đặt lại mật khẩu' : 'Link không hợp lệ'}
            </Badge>
          </div>

          <h2 className="font-display mt-5 text-2xl font-semibold md:text-3xl">
            Đặt lại mật khẩu
          </h2>

          {!env.DB ? (
            <InvalidReset message="Database chưa sẵn sàng." />
          ) : !invite || invite.purpose !== 'password_reset' ? (
            <InvalidReset message="Link đặt lại mật khẩu không hợp lệ." />
          ) : invite.status !== 'pending' ? (
            <InvalidReset message={statusMessage(invite.status)} />
          ) : (
            <ResetForm invite={invite} pageError={pageError} token={token} />
          )}
        </div>
      </section>
    </main>
  );
}

function ResetForm({
  invite,
  pageError,
  token,
}: {
  invite: AccountInviteDetails;
  pageError: string | null;
  token: string;
}) {
  return (
    <form
      action="/api/auth/reset-password"
      className="mt-5 grid gap-4"
      method="post"
    >
      <input name="token" type="hidden" value={token} />

      <div className="rounded-lg border border-border bg-white p-3">
        <p className="break-all text-sm font-medium">{invite.email}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {invite.displayName ?? invite.clientName ?? 'Artist portal account'}
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="password">
          Mật khẩu mới
        </label>
        <Input
          autoComplete="new-password"
          className="h-11 bg-white"
          id="password"
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          required
          type="password"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="confirm_password">
          Nhập lại mật khẩu mới
        </label>
        <Input
          autoComplete="new-password"
          className="h-11 bg-white"
          id="confirm_password"
          minLength={PASSWORD_MIN_LENGTH}
          name="confirm_password"
          required
          type="password"
        />
      </div>

      {pageError ? (
        <p className="rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
          {pageError}
        </p>
      ) : null}

      <Button className="h-11 w-full" type="submit">
        <ShieldCheck className="size-4" />
        Lưu mật khẩu mới
      </Button>
    </form>
  );
}

function InvalidReset({ message }: { message: string }) {
  return (
    <div className="mt-5 space-y-4">
      <p className="rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
        {message}
      </p>
      <a
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
        href="/forgot-password"
      >
        <ArrowLeft className="size-4" />
        Gửi link mới
      </a>
    </div>
  );
}

function statusMessage(status: AccountInviteDetails['status']) {
  if (status === 'expired') return 'Link đặt lại mật khẩu đã hết hạn.';
  if (status === 'used') return 'Link đặt lại mật khẩu đã được sử dụng.';
  if (status === 'revoked') return 'Link đặt lại mật khẩu đã bị hủy.';
  return 'Link đặt lại mật khẩu không hợp lệ.';
}

function resetErrorMessage(error: string | null) {
  if (error === 'config') return 'Database chưa sẵn sàng.';
  if (error === 'expired') return 'Link đặt lại mật khẩu đã hết hạn.';
  if (error === 'used') return 'Link đặt lại mật khẩu đã được sử dụng.';
  if (error === 'revoked') return 'Link đặt lại mật khẩu đã bị hủy.';
  if (error === 'password_length') {
    return `Mật khẩu cần có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  }
  if (error === 'password_match') return 'Mật khẩu nhập lại chưa khớp.';
  if (error === 'invalid') return 'Link đặt lại mật khẩu không hợp lệ.';

  return null;
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
