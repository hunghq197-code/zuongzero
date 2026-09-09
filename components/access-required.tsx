import { LockKeyhole } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark, EqualizerBars } from '@/components/music-brand';

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
                {badge}
              </Badge>
              <h1 className="font-display mt-4 text-2xl font-semibold">
                {title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {reason}
              </p>
              <p className="mt-4 break-all text-sm text-muted-foreground">
                Tài khoản hiện tại: {email}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#00796f] px-4 text-sm font-medium text-white hover:bg-[#006c64]"
                  href={primaryHref}
                >
                  {primaryLabel}
                </a>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
                  href={secondaryHref}
                >
                  {secondaryLabel}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
