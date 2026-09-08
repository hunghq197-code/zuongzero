import { LockKeyhole } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export function AccessRequired({
  badge,
  email,
  primaryHref,
  primaryLabel,
  reason,
  secondaryHref,
  secondaryLabel,
  title,
}: {
  badge: string;
  email: string;
  primaryHref: string;
  primaryLabel: string;
  reason: string;
  secondaryHref: string;
  secondaryLabel: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <section className="w-full max-w-2xl rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
            <LockKeyhole className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge className="rounded-lg bg-[#f6e8bf] text-[#7c5d18]">
              {badge}
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#3a2a0a]">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6f5318]">{reason}</p>
            <p className="mt-4 break-all text-sm text-[#6f5318]">
              Tài khoản hiện tại: {email}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2f6f45] px-4 text-sm font-medium text-white hover:bg-[#255937]"
                href={primaryHref}
              >
                {primaryLabel}
              </a>
              <a
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7b765] px-4 text-sm font-medium text-[#3a2a0a] hover:bg-[#f6e8bf]"
                href={secondaryHref}
              >
                {secondaryLabel}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
