/* eslint-disable next/no-html-link-for-pages */
import { env } from 'cloudflare:workers';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, EqualizerBars } from '@/components/music-brand';
import {
  cleanInviteToken,
  readAccountInviteByToken,
  type AccountInviteDetails,
} from '@/lib/account-invites';
import { PASSWORD_MIN_LENGTH } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SetupAccountPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const token = cleanInviteToken(readSearchParam(params, 'token'));
  const invite =
    env.DB && token ? await readAccountInviteByToken(env.DB, token) : null;
  const pageError = setupErrorMessage(readSearchParam(params, 'error'));
  const canActivate =
    invite?.purpose === 'account_activation' && invite.status === 'pending';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="bg-[#071118] p-6 text-white md:p-8">
          <BrandMark />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            Account activation
          </p>
          <h1 className="font-display mt-4 text-3xl font-semibold">
            Royalty Console
          </h1>
          <EqualizerBars className="mt-10" />
        </div>

        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#e7fbf7] text-[#00796f]">
              <KeyRound className="size-5" />
            </div>
            <Badge className="rounded-lg" variant="outline">
              {canActivate ? 'Kích hoạt' : 'Link không hợp lệ'}
            </Badge>
          </div>

          <h2 className="font-display mt-5 text-2xl font-semibold md:text-3xl">
            Kích hoạt tài khoản
          </h2>

          {!env.DB ? (
            <InvalidInvite message="Database chưa sẵn sàng." />
          ) : !invite || invite.purpose !== 'account_activation' ? (
            <InvalidInvite message="Link kích hoạt không hợp lệ." />
          ) : invite.status !== 'pending' ? (
            <InvalidInvite message={statusMessage(invite.status)} />
          ) : (
            <ActivationForm
              invite={invite}
              pageError={pageError}
              token={token}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function ActivationForm({
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
      action="/api/auth/setup-account"
      className="mt-5 grid gap-4"
      method="post"
    >
      <input name="token" type="hidden" value={token} />

      <div className="rounded-lg border border-border bg-white p-3">
        <p className="break-all text-sm font-medium">{invite.email}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(invite.role)}
          {invite.clientName ? ` - ${invite.clientName}` : ''}
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="display_name">
          Tên hiển thị
        </label>
        <Input
          autoComplete="name"
          defaultValue={invite.displayName ?? invite.clientName ?? ''}
          id="display_name"
          name="display_name"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="company_name">
            Công ty
          </label>
          <Input
            autoComplete="organization"
            defaultValue={invite.companyName ?? invite.clientName ?? ''}
            id="company_name"
            name="company_name"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="phone">
            Số điện thoại
          </label>
          <Input
            autoComplete="tel"
            defaultValue={invite.phone ?? ''}
            id="phone"
            inputMode="tel"
            name="phone"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="password">
          Mật khẩu
        </label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          required
          type="password"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="confirm_password">
          Nhập lại mật khẩu
        </label>
        <Input
          autoComplete="new-password"
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

      <Button className="h-10 w-full" type="submit">
        <ShieldCheck className="size-4" />
        Kích hoạt và đăng nhập
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

function InvalidInvite({ message }: { message: string }) {
  return (
    <div className="mt-5 space-y-4">
      <p className="rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
        {message}
      </p>
      <a
        className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
        href="/login"
      >
        Về trang đăng nhập
      </a>
    </div>
  );
}

function roleLabel(role: AccountInviteDetails['role']) {
  if (role === 'admin') return 'Quản lý';
  if (role === 'client') return 'Khách hàng';
  if (role === 'super_admin') return 'Super admin';
  if (role === 'auditor') return 'Auditor';
  return 'Pending';
}

function statusMessage(status: AccountInviteDetails['status']) {
  if (status === 'expired') return 'Link kích hoạt đã hết hạn.';
  if (status === 'used') return 'Link kích hoạt đã được sử dụng.';
  if (status === 'revoked') return 'Link kích hoạt đã bị hủy.';
  return 'Link kích hoạt không hợp lệ.';
}

function setupErrorMessage(error: string | null) {
  if (error === 'config') return 'Database chưa sẵn sàng.';
  if (error === 'expired') return 'Link kích hoạt đã hết hạn.';
  if (error === 'used') return 'Link kích hoạt đã được sử dụng.';
  if (error === 'revoked') return 'Link kích hoạt đã bị hủy.';
  if (error === 'password_length') {
    return `Mật khẩu cần có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  }
  if (error === 'password_match') return 'Mật khẩu nhập lại chưa khớp.';
  if (error === 'invalid') return 'Link kích hoạt không hợp lệ.';

  return null;
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
