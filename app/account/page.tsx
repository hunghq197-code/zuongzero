/* eslint-disable next/no-html-link-for-pages */
import { env } from 'cloudflare:workers';
import { ArrowLeft, KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { getClientPortalAccess } from '@/lib/access-control';
import {
  getAdminAccess,
  getConfiguredSuperAdminEmails,
} from '@/lib/admin-auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/app-auth';
import { chatGPTSignOutPath, requireChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

type AccountProfile = {
  companyName: string | null;
  displayName: string | null;
  email: string;
  phone: string | null;
  role: 'super_admin' | 'admin' | 'client' | 'auditor' | 'pending';
  status: 'active' | 'disabled';
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const user = await requireChatGPTUser('/account');
  const profile = await readAccountProfile(user.email, user.displayName);
  const adminAccess = await getAdminAccess(user.email);
  const clientAccess = await getClientPortalAccess(user);
  const passwordManagedByServer = getConfiguredSuperAdminEmails().includes(
    user.email.trim().toLowerCase(),
  );
  const profileMessage = profileStatusMessage(
    readSearchParam(params, 'profile'),
  );
  const passwordMessage = passwordStatusMessage(
    readSearchParam(params, 'password'),
  );

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground md:px-8">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Account
            </p>
            <h1 className="font-display truncate text-2xl font-semibold md:text-3xl">
              Thông tin cá nhân
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adminAccess.allowed ? (
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
              href="/admin"
            >
              <ArrowLeft className="size-4" />
              Admin
            </a>
          ) : null}
          {clientAccess.allowed ? (
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Dashboard
            </a>
          ) : null}
          <a
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
            href={chatGPTSignOutPath('/login')}
          >
            <LogOut className="size-4" />
            Đăng xuất
          </a>
        </div>
      </header>

      <section className="music-card mx-auto mt-6 w-full max-w-6xl overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5">
            <Badge className="rounded-lg bg-[#e7fbf7] text-[#00796f]">
              {roleLabel(profile.role)}
            </Badge>
            <h2 className="font-display mt-4 truncate text-2xl font-semibold">
              {profile.displayName ?? profile.email}
            </h2>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {profile.email}
            </p>
          </div>
          <div className="bg-[#071118] p-5 text-white">
            <EqualizerBars />
            <p className="mt-6 text-sm text-white/62">Secure profile</p>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-4 grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="music-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Hồ sơ</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {profile.email}
              </p>
            </div>
            <Badge className="rounded-lg bg-primary/10 text-primary">
              {roleLabel(profile.role)}
            </Badge>
          </div>

          <form
            action="/api/account/profile"
            className="mt-5 grid gap-4"
            method="post"
          >
            <div className="space-y-2">
              <label
                className="block text-sm font-medium"
                htmlFor="display_name"
              >
                Tên hiển thị
              </label>
              <Input
                autoComplete="name"
                defaultValue={profile.displayName ?? ''}
                id="display_name"
                name="display_name"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor="company_name"
                >
                  Công ty
                </label>
                <Input
                  autoComplete="organization"
                  defaultValue={profile.companyName ?? ''}
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
                  defaultValue={profile.phone ?? ''}
                  id="phone"
                  inputMode="tel"
                  name="phone"
                />
              </div>
            </div>

            {profileMessage ? (
              <p className={messageClass(profileMessage.tone)}>
                {profileMessage.text}
              </p>
            ) : null}

            <Button className="h-10 w-full sm:w-fit" type="submit">
              <Save className="size-4" />
              Lưu thông tin
            </Button>
          </form>
        </section>

        {passwordManagedByServer ? null : (
          <section className="music-card p-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">Mật khẩu</h2>
              <KeyRound className="size-5 text-primary" />
            </div>

            <form
              action="/api/account/password"
              className="mt-5 grid gap-4"
              method="post"
            >
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor="current_password"
                >
                  Mật khẩu hiện tại
                </label>
                <Input
                  autoComplete="current-password"
                  id="current_password"
                  name="current_password"
                  required
                  type="password"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor="new_password"
                >
                  Mật khẩu mới
                </label>
                <Input
                  autoComplete="new-password"
                  id="new_password"
                  minLength={PASSWORD_MIN_LENGTH}
                  name="new_password"
                  required
                  type="password"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor="confirm_password"
                >
                  Nhập lại mật khẩu mới
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

              {passwordMessage ? (
                <p className={messageClass(passwordMessage.tone)}>
                  {passwordMessage.text}
                </p>
              ) : null}

              <Button className="h-10 w-full" type="submit">
                <ShieldCheck className="size-4" />
                Đổi mật khẩu
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

async function readAccountProfile(
  email: string,
  fallbackDisplayName: string,
): Promise<AccountProfile> {
  const normalizedEmail = email.trim().toLowerCase();

  if (env.DB) {
    const row = await env.DB.prepare(
      `SELECT
         email,
         display_name AS displayName,
         company_name AS companyName,
         phone,
         role,
         status
       FROM users
       WHERE lower(email) = ?
       LIMIT 1`,
    )
      .bind(normalizedEmail)
      .first<AccountProfile>();

    if (row) return row;
  }

  return {
    companyName: null,
    displayName: fallbackDisplayName,
    email,
    phone: null,
    role: 'pending',
    status: 'active',
  };
}

function roleLabel(role: AccountProfile['role']) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Quản lý';
  if (role === 'client') return 'Khách hàng';
  if (role === 'auditor') return 'Auditor';
  return 'Pending';
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function profileStatusMessage(status: string | null) {
  if (status === 'saved') {
    return {
      text: 'Đã lưu thông tin.',
      tone: 'success' as const,
    };
  }
  if (status === 'config') {
    return {
      text: 'Chưa thể lưu vì database chưa sẵn sàng.',
      tone: 'error' as const,
    };
  }

  return null;
}

function passwordStatusMessage(status: string | null) {
  const messages: Record<string, { text: string; tone: 'error' | 'success' }> =
    {
      changed: {
        text: 'Đã đổi mật khẩu.',
        tone: 'success',
      },
      config: {
        text: 'Chưa thể đổi mật khẩu vì database chưa sẵn sàng.',
        tone: 'error',
      },
      current_invalid: {
        text: 'Mật khẩu hiện tại không đúng.',
        tone: 'error',
      },
      managed: {
        text: 'Không thể đổi mật khẩu tài khoản này.',
        tone: 'error',
      },
      password_length: {
        text: `Mật khẩu mới cần có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
        tone: 'error',
      },
      password_match: {
        text: 'Mật khẩu mới chưa khớp.',
        tone: 'error',
      },
    };

  return status ? messages[status] : null;
}

function messageClass(tone: 'error' | 'success') {
  return `rounded-lg border px-3 py-2 text-sm ${
    tone === 'error'
      ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
      : 'border-[#b7d8c2] bg-[#f1faf3] text-[#2f6f45]'
  }`;
}
