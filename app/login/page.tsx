/* eslint-disable next/no-html-link-for-pages */
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { getClientPortalAccess } from '@/lib/access-control';
import { getAdminAccess } from '@/lib/admin-auth';
import { safeRelativeReturnPath } from '@/lib/app-auth';
import { chatGPTSignOutPath, getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const returnTo = safeRelativeReturnPath(readSearchParam(params, 'return_to'));
  const errorMessage = resolveErrorMessage(readSearchParam(params, 'error'));
  const resetMessage = resolveResetMessage(readSearchParam(params, 'reset'));
  const email = readSearchParam(params, 'email');
  const user = await getChatGPTUser();
  const adminAccess = user ? await getAdminAccess(user.email) : null;
  const clientAccess = user ? await getClientPortalAccess(user) : null;
  const status = resolveStatus({
    adminRole: adminAccess?.allowed ? adminAccess.role : null,
    clientAccessLevel: clientAccess?.allowed ? clientAccess.accessLevel : null,
    hasUser: Boolean(user),
  });
  const dashboardHref = resolveDashboardHref({
    adminAllowed: adminAccess?.allowed ?? false,
    clientAllowed: clientAccess?.allowed ?? false,
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-6xl overflow-hidden lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="hidden min-h-[620px] flex-col justify-between bg-[#071118] p-8 text-white lg:flex">
          <div>
            <BrandMark />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
              Secure music rights workspace
            </p>
            <h1 className="font-display mt-4 max-w-xl text-5xl font-semibold leading-tight">
              Royalty Console
            </h1>
          </div>
          <div>
            <EqualizerBars />
            <div className="mt-8 grid grid-cols-3 gap-3">
              {['Catalogs', 'Statements', 'Access'].map((item) => (
                <div className="border-t border-white/15 pt-3" key={item}>
                  <p className="text-sm font-semibold">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 md:p-8">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <BrandMark />
            <Badge className="rounded-lg" variant="outline">
              {status}
            </Badge>
          </div>

          <div className="mb-6 hidden lg:block">
            <Badge className="rounded-lg" variant="outline">
              {status}
            </Badge>
          </div>

          <h2 className="font-display text-3xl font-semibold md:text-4xl">
            Đăng nhập
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Truy cập dashboard royalty theo quyền đã được cấp.
          </p>

          <form action="/api/auth/login" className="mt-7" method="post">
            <input name="return_to" type="hidden" value={returnTo} />

            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  autoComplete="email"
                  className="h-11 bg-white"
                  defaultValue={email ?? user?.email ?? ''}
                  id="email"
                  inputMode="email"
                  name="email"
                  required
                  type="email"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="block text-sm font-medium"
                    htmlFor="password"
                  >
                    Mật khẩu
                  </label>
                  <a
                    className="text-sm font-medium text-[#00796f] hover:text-[#005f58]"
                    href="/forgot-password"
                  >
                    Quên mật khẩu?
                  </a>
                </div>
                <Input
                  autoComplete="current-password"
                  className="h-11 bg-white"
                  id="password"
                  minLength={12}
                  name="password"
                  required
                  type="password"
                />
              </div>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
                {errorMessage}
              </p>
            ) : null}

            {resetMessage ? (
              <p className="mt-4 rounded-lg border border-[#bce9e4] bg-[#f0fffc] px-3 py-2 text-sm text-[#047a70]">
                {resetMessage}
              </p>
            ) : null}

            {user ? (
              <div className="mt-5 rounded-lg border border-border bg-white p-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{user.email}</span>
                </div>
                {!adminAccess?.allowed && !clientAccess?.allowed ? (
                  <p className="mt-2 text-sm leading-6 text-[#a53a30]">
                    Chưa được cấp quyền truy cập.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button className="mt-6 h-11 w-full" type="submit">
              <ShieldCheck className="size-4" />
              Đăng nhập
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {dashboardHref ? (
              <a
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
                href={dashboardHref}
              >
                Vào dashboard
              </a>
            ) : null}

            {user ? (
              <a
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
                href={chatGPTSignOutPath('/login')}
              >
                Đăng xuất
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function resolveStatus({
  adminRole,
  clientAccessLevel,
  hasUser,
}: {
  adminRole: 'super_admin' | 'admin' | null;
  clientAccessLevel: 'admin' | 'owner' | 'viewer' | 'finance' | null;
  hasUser: boolean;
}) {
  if (!hasUser) return 'Cần đăng nhập';
  if (adminRole === 'super_admin') return 'Super admin';
  if (adminRole === 'admin') return 'Quản lý';
  if (clientAccessLevel) return `Khách hàng: ${clientAccessLevel}`;

  return 'Chưa được cấp quyền';
}

function resolveDashboardHref({
  adminAllowed,
  clientAllowed,
}: {
  adminAllowed: boolean;
  clientAllowed: boolean;
}) {
  if (adminAllowed) return '/admin';
  if (clientAllowed) return '/';

  return null;
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveErrorMessage(error: string | null) {
  if (error === 'config') {
    return 'Chưa cấu hình tài khoản super admin.';
  }
  if (error === 'invalid') {
    return 'Email hoặc mật khẩu không đúng.';
  }

  return null;
}

function resolveResetMessage(reset: string | null) {
  if (reset === 'changed') {
    return 'Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.';
  }

  return null;
}
