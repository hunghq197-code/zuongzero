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

const railItems = {
  admin: [
    { href: '/admin', icon: LayoutDashboard, label: 'Console' },
    { href: '/admin', icon: UsersRound, label: 'Clients' },
    { href: '/admin', icon: UploadCloud, label: 'Uploads' },
    { href: '/account', icon: ShieldCheck, label: 'Account' },
  ],
  client: [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/', icon: FileSpreadsheet, label: 'Statements' },
    { href: '/', icon: WalletCards, label: 'Royalties' },
    { href: '/account', icon: ShieldCheck, label: 'Account' },
  ],
} satisfies Record<
  ConsoleRailVariant,
  Array<{
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
  }>
>;

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
  variant,
}: {
  activeIndex?: number;
  variant: ConsoleRailVariant;
}) {
  return (
    <aside className="flex flex-col items-center gap-3 border-r border-white/10 bg-[#071118] px-4 py-5 text-white max-lg:hidden">
      <BrandMark />
      <div className="mt-6 grid gap-2">
        {railItems[variant].map((item, index) => {
          const Icon = item.icon;
          const isActive = index === activeIndex;

          return (
            <a
              aria-label={item.label}
              className={`flex size-11 items-center justify-center rounded-lg transition ${
                isActive
                  ? 'bg-white text-[#071118]'
                  : 'text-white/62 hover:bg-white/10 hover:text-white'
              }`}
              href={item.href}
              key={item.label}
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
