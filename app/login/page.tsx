import {
  Building2,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { getClientPortalAccess } from '@/lib/access-control';
import { getAdminAccess } from '@/lib/admin-auth';
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getChatGPTUser();
  const adminAccess = user ? getAdminAccess(user.email) : null;
  const clientAccess = user ? await getClientPortalAccess(user) : null;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Secure access
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal md:text-4xl">
              Đăng nhập dashboard royalty
            </h1>
          </div>
          {user ? (
            <Badge className="h-8 rounded-lg bg-primary/10 px-3 text-primary">
              <KeyRound className="size-4" />
              {user.email}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <AuthCard
            body="Khách hàng xem dashboard đã publish, không có quyền upload, sửa, replace hoặc publish dữ liệu."
            ctaHref={user ? '/' : chatGPTSignInPath('/')}
            ctaLabel={
              user && clientAccess?.allowed
                ? 'Vào dashboard khách hàng'
                : user
                  ? 'Kiểm tra quyền dashboard'
                  : 'Đăng nhập khách hàng'
            }
            icon="client"
            status={
              user
                ? clientAccess?.allowed
                  ? `Đã có quyền ${clientAccess.accessLevel}`
                  : 'Chưa được gán client'
                : 'Cần đăng nhập'
            }
            title="Khách hàng"
          />

          <AuthCard
            body="Admin quản lý khách hàng, upload file Excel theo tháng, kiểm tra dữ liệu và publish statement cho khách xem."
            ctaHref={user ? '/admin' : chatGPTSignInPath('/admin')}
            ctaLabel={
              user && adminAccess?.allowed
                ? 'Vào admin console'
                : user
                  ? 'Kiểm tra quyền admin'
                  : 'Đăng nhập admin'
            }
            icon="admin"
            status={
              user
                ? adminAccess?.allowed
                  ? 'Có trong admin allowlist'
                  : 'Chưa có quyền admin'
                : 'Cần đăng nhập'
            }
            title="Admin"
          />
        </div>

        <div className="mt-5 rounded-lg border border-border bg-card p-4 shadow-sm">
          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Tài khoản đã xác thực bằng ChatGPT. Nếu cần quyền khác, gửi yêu
                cầu đăng ký để admin duyệt.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  href="/register"
                >
                  Đăng ký quyền
                </Link>
                <a
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  href={chatGPTSignOutPath('/login')}
                >
                  Đăng xuất
                </a>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              Hệ thống không dùng mật khẩu riêng trong MVP. Đăng nhập bằng
              ChatGPT trước, sau đó server kiểm tra role và client assignment.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function AuthCard({
  body,
  ctaHref,
  ctaLabel,
  icon,
  status,
  title,
}: {
  body: string;
  ctaHref: string;
  ctaLabel: string;
  icon: 'client' | 'admin';
  status: string;
  title: string;
}) {
  const Icon = icon === 'admin' ? ShieldCheck : Building2;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </div>
        <Badge className="rounded-lg" variant="outline">
          {status}
        </Badge>
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-normal">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
      <CtaLink href={ctaHref}>
        {icon === 'admin' ? (
          <LockKeyhole className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        {ctaLabel}
      </CtaLink>
    </section>
  );
}

function CtaLink({ children, href }: { children: ReactNode; href: string }) {
  const className =
    'mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90';

  if (href.startsWith('/signin-with-chatgpt')) {
    return (
      <a className={className} href={href} target="_top">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
