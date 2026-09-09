/* eslint-disable next/no-html-link-for-pages */
import { LockKeyhole, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { chatGPTSignOutPath, getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getChatGPTUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-4xl overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="bg-[#071118] p-6 text-white">
          <BrandMark />
          <EqualizerBars className="mt-10" />
        </div>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#ffecef] text-[#bb2343]">
              <LockKeyhole className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Badge className="rounded-lg bg-[#ffecef] text-[#bb2343]">
                Access
              </Badge>
              <h1 className="font-display mt-4 text-2xl font-semibold">
                Chưa được cấp tài khoản
              </h1>
              {user ? (
                <p className="mt-4 break-all text-sm text-muted-foreground">
                  Tài khoản hiện tại: {user.email}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00796f] px-4 text-sm font-medium text-white hover:bg-[#006c64]"
                  href="/login"
                >
                  <ShieldCheck className="size-4" />
                  Về trang đăng nhập
                </a>
                {user ? (
                  <a
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
                    href={chatGPTSignOutPath('/login')}
                  >
                    Đăng xuất
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
