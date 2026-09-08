/* eslint-disable next/no-html-link-for-pages */
import { LockKeyhole, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { chatGPTSignOutPath, getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getChatGPTUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="w-full max-w-2xl rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
            <LockKeyhole className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge className="rounded-lg bg-[#f6e8bf] text-[#7c5d18]">
              Registration closed
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#3a2a0a]">
              Tài khoản do super admin cấp
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6f5318]">
              Hệ thống không mở đăng ký tự do. Super admin sẽ tạo tài khoản quản
              lý hoặc khách hàng, sau đó gán role và client tương ứng.
            </p>
            {user ? (
              <p className="mt-4 break-all text-sm text-[#6f5318]">
                Tài khoản hiện tại: {user.email}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2f6f45] px-4 text-sm font-medium text-white hover:bg-[#255937]"
                href="/login"
              >
                <ShieldCheck className="size-4" />
                Về trang đăng nhập
              </a>
              {user ? (
                <a
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7b765] px-4 text-sm font-medium text-[#3a2a0a] hover:bg-[#f6e8bf]"
                  href={chatGPTSignOutPath('/login')}
                >
                  Đăng xuất
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
