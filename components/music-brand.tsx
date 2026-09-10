import type { ComponentType } from 'react';
import {
  FileSpreadsheet,
  LayoutDashboard,
  Music2,
  ShieldCheck,
  UploadCloud,
  UsersRound,
  WalletCards,
} from 'lucide-react';

type ConsoleRailVariant = 'admin' | 'client';

export type ConsoleRailItem = {
  href?: string;
  icon: ComponentType<{ className?: string }>;
  id?: string;
  label: string;
};

const railItems: Record<ConsoleRailVariant, ConsoleRailItem[]> = {
  admin: [
    { href: '/admin', icon: LayoutDashboard, label: 'Tổng quan' },
    { href: '/admin', icon: UsersRound, label: 'Khách hàng' },
    { href: '/admin', icon: UploadCloud, label: 'Statement' },
    { href: '/account', icon: ShieldCheck, label: 'Tài khoản' },
  ],
  client: [
    { href: '#client-overview', icon: LayoutDashboard, label: 'Tổng quan' },
    { href: '#client-statements', icon: FileSpreadsheet, label: 'Statement' },
    { href: '#client-breakdown', icon: WalletCards, label: 'Breakdown' },
    { href: '/account', icon: ShieldCheck, label: 'Tài khoản' },
  ],
};

const barHeights = [
  'h-4',
  'h-7',
  'h-5',
  'h-10',
  'h-6',
  'h-8',
  'h-3',
  'h-9',
  'h-5',
  'h-7',
] as const;

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex size-11 items-center justify-center rounded-lg bg-[#00b8a9] text-[#071118] shadow-[0_10px_30px_rgba(0,184,169,0.25)] ${className}`}
    >
      <Music2 className="size-5" />
    </div>
  );
}

export function EqualizerBars({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-12 items-center gap-1.5 overflow-hidden ${className}`}
    >
      {barHeights.map((height, index) => (
        <span
          className={`${height} w-1.5 rounded-full ${
            index % 3 === 0
              ? 'bg-[#00b8a9]'
              : index % 3 === 1
                ? 'bg-[#ff4d6d]'
                : 'bg-[#7c3aed]'
          }`}
          key={`${height}-${index}`}
        />
      ))}
    </div>
  );
}

export function ConsoleRail({
  activeIndex = 0,
  activeItem,
  items,
  onSelect,
  variant,
}: {
  activeIndex?: number;
  activeItem?: string;
  items?: ConsoleRailItem[];
  onSelect?: (itemId: string) => void;
  variant: ConsoleRailVariant;
}) {
  const resolvedItems = items ?? railItems[variant];

  return (
    <aside className="flex flex-col items-center gap-3 border-r border-white/10 bg-[#071118] px-4 py-5 text-white max-lg:hidden">
      <BrandMark />
      <div className="mt-6 grid gap-2">
        {resolvedItems.map((item, index) => {
          const Icon = item.icon;
          const itemKey = item.id ?? item.href ?? item.label;
          const isActive = activeItem
            ? item.id === activeItem || item.href === activeItem
            : index === activeIndex;
          const itemClass = `flex size-11 items-center justify-center rounded-lg transition ${
            isActive
              ? 'bg-white text-[#071118]'
              : 'text-white/62 hover:bg-white/10 hover:text-white'
          }`;

          if (item.id && onSelect) {
            return (
              <button
                aria-label={item.label}
                aria-pressed={isActive}
                className={itemClass}
                key={itemKey}
                onClick={() => onSelect(item.id ?? itemKey)}
                title={item.label}
                type="button"
              >
                <Icon className="size-5" />
              </button>
            );
          }

          return (
            <a
              aria-label={item.label}
              className={itemClass}
              href={item.href ?? '#'}
              key={itemKey}
              title={item.label}
            >
              <Icon className="size-5" />
            </a>
          );
        })}
      </div>
    </aside>
  );
}
