'use client';

import { cn } from '@/lib/utils';

export function ChartHoverTooltip({
  className,
  label,
  meta,
  value,
}: {
  className?: string;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 min-w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/10 bg-[#071118] px-3 py-2 text-left text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100',
        className,
      )}
      role="tooltip"
    >
      <span className="block max-w-[190px] truncate font-semibold">
        {label}
      </span>
      <span className="mt-1 block font-mono tabular-nums">{value}</span>
      {meta ? <span className="mt-1 block text-white/65">{meta}</span> : null}
    </span>
  );
}
