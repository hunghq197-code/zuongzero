/* eslint-disable next/no-html-link-for-pages */
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';

import { BrandMark, EqualizerBars } from '@/components/music-brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const sent = readSearchParam(params, 'sent') === '1';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground md:px-8">
      <section className="music-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="bg-[#071118] p-6 text-white md:p-8">
          <BrandMark />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            Password recovery
          </p>
          <h1 className="font-display mt-4 text-3xl font-semibold">
            Royalty Console
          </h1>
          <EqualizerBars className="mt-10" />
        </div>

        <div className="p-5 md:p-8">
          <div className="flex size-11 items-center justify-center rounded-lg bg-[#e7fbf7] text-[#00796f]">
            <Mail className="size-5" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold md:text-3xl">
            Quên mật khẩu
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Nhập email tài khoản để nhận link đặt lại mật khẩu.
          </p>

          <form
            action="/api/auth/forgot-password"
            className="mt-6 grid gap-4"
            method="post"
          >
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                autoComplete="email"
                className="h-11 bg-white"
                id="email"
                inputMode="email"
                name="email"
                required
                type="email"
              />
            </div>

            {sent ? (
              <p className="rounded-lg border border-[#bce9e4] bg-[#f0fffc] px-3 py-2 text-sm text-[#047a70]">
                Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được
                gửi.
              </p>
            ) : null}

            <Button className="h-11 w-full" type="submit">
              <ShieldCheck className="size-4" />
              Gửi link đặt lại mật khẩu
            </Button>
          </form>

          <a
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
            href="/login"
          >
            <ArrowLeft className="size-4" />
            Về trang đăng nhập
          </a>
        </div>
      </section>
    </main>
  );
}

function readSearchParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
