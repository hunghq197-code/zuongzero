/* eslint-disable next/no-html-link-for-pages */
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getClientPortalAccess } from '@/lib/access-control';
import { getAdminAccess } from '@/lib/admin-auth';
import {
  authProviderName,
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getChatGPTUser();
  const authProvider = authProviderName();
  const adminAccess = user ? await getAdminAccess(user.email) : null;
  const clientAccess = user ? await getClientPortalAccess(user) : null;
  const destination = resolveDestination({
    adminAllowed: adminAccess?.allowed ?? false,
    clientAllowed: clientAccess?.allowed ?? false,
    hasUser: Boolean(user),
    authProvider,
  });
  const status = resolveStatus({
    adminRole: adminAccess?.allowed ? adminAccess.role : null,
    clientAccessLevel: clientAccess?.allowed ? clientAccess.accessLevel : null,
    hasUser: Boolean(user),
  });
  const buttonLabel = resolveButtonLabel({
    adminRole: adminAccess?.allowed ? adminAccess.role : null,
    clientAllowed: clientAccess?.allowed ?? false,
    hasUser: Boolean(user),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="w-full max-w-[520px]">
        <div className="mb-6">
          <p className="text-sm font-medium text-muted-foreground">
            Secure access
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal md:text-4xl">
            Đăng nhập dashboard royalty
          </h1>
        </div>

        <form
          action={destination}
          className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LockKeyhole className="size-5" />
            </div>
            <Badge className="rounded-lg" variant="outline">
              {status}
            </Badge>
          </div>

          <h2 className="mt-5 text-2xl font-semibold tracking-normal">
            Một cổng đăng nhập
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Đăng nhập bằng {authProvider}. Sau khi xác thực, hệ thống kiểm tra
            role phía server để đưa super admin, quản lý hoặc khách hàng vào
            đúng khu vực.
          </p>

          {user ? (
            <div className="mt-5 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-primary" />
                {user.email}
              </div>
              {!adminAccess?.allowed && !clientAccess?.allowed ? (
                <p className="mt-2 text-sm leading-6 text-[#a53a30]">
                  Email này chưa được super admin cấp quyền truy cập dashboard.
                </p>
              ) : null}
            </div>
          ) : null}

          <Button className="mt-5 h-10 w-full" type="submit">
            <ShieldCheck className="size-4" />
            {buttonLabel}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        {user ? (
          <a
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
            href={chatGPTSignOutPath('/login')}
          >
            Đăng xuất
          </a>
        ) : null}
      </section>
    </main>
  );
}

function resolveDestination({
  adminAllowed,
  authProvider,
  clientAllowed,
  hasUser,
}: {
  adminAllowed: boolean;
  authProvider: string;
  clientAllowed: boolean;
  hasUser: boolean;
}) {
  if (adminAllowed) return '/admin';
  if (clientAllowed) return '/';
  if (hasUser) return '/login';
  if (authProvider === 'Cloudflare Access') return '/';

  return chatGPTSignInPath('/');
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

function resolveButtonLabel({
  adminRole,
  clientAllowed,
  hasUser,
}: {
  adminRole: 'super_admin' | 'admin' | null;
  clientAllowed: boolean;
  hasUser: boolean;
}) {
  if (!hasUser) return 'Đăng nhập';
  if (adminRole === 'super_admin') return 'Vào trang super admin';
  if (adminRole === 'admin') return 'Vào trang quản lý';
  if (clientAllowed) return 'Vào dashboard khách hàng';

  return 'Kiểm tra lại quyền truy cập';
}
