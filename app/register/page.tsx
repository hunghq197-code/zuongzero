import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { RegistrationForm } from '@/components/registration-form';
import { Badge } from '@/components/ui/badge';
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: { type?: string } | Promise<{ type?: string }>;
}) {
  const user = await getChatGPTUser();
  const params = await Promise.resolve(searchParams);
  const initialRequestType =
    params?.type === 'admin_access' ? 'admin_access' : 'client_access';

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground md:px-8">
      <section className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Access request
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal md:text-4xl">
              Đăng ký quyền truy cập
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Tạo yêu cầu cho khách hàng hoặc admin. Tài khoản chỉ có quyền sau
              khi được duyệt và gán role phía server.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              href="/login"
            >
              Login
            </Link>
            {user ? (
              <a
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                href={chatGPTSignOutPath('/login')}
              >
                Đăng xuất
              </a>
            ) : null}
          </div>
        </div>

        {user ? (
          <RegistrationForm
            initialRequestType={initialRequestType}
            userEmail={user.email}
          />
        ) : (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ClipboardCheck className="size-5" />
                </div>
                <div>
                  <Badge className="rounded-lg bg-primary/10 text-primary">
                    Sign in required
                  </Badge>
                  <h2 className="mt-4 text-2xl font-semibold tracking-normal">
                    Đăng nhập trước khi gửi yêu cầu
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Form đăng ký phải gắn với một tài khoản đã xác thực để admin
                    có thể kiểm tra và cấp quyền đúng người.
                  </p>
                  <a
                    className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    href={chatGPTSignInPath(
                      `/register?type=${initialRequestType}`,
                    )}
                    target="_top"
                  >
                    <ShieldCheck className="size-4" />
                    Đăng nhập bằng ChatGPT
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
