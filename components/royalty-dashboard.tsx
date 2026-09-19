'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Disc3,
  Download,
  FileSpreadsheet,
  Filter,
  KeyRound,
  LogOut,
  RadioTower,
  Settings,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  ConsoleRail,
  EqualizerBars,
  BrandMark,
} from '@/components/music-brand';
import { ChartHoverTooltip } from '@/components/chart-hover-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TablePagination,
  usePaginatedRows,
} from '@/components/table-pagination';
import {
  breakdownSections,
  breakdownsByCurrency,
  clients,
  periods,
  revenueTrend,
  type BreakdownItem,
  type BreakdownKey,
  type BreakdownSection,
  type RevenueTrendPoint,
  type StatementMetric,
  type StatementPeriod,
} from '@/lib/dashboard-data';
import {
  currentCalendarQuarter,
  periodDisplayLabel,
} from '@/lib/reporting-periods';
import type { DashboardBreakdownsByPeriod } from '@/lib/client-dashboard-data';
import { createEmptyCurrencyBreakdowns } from '@/lib/royalty-breakdowns';
import { SETTLEMENT_THRESHOLD_VND } from '@/lib/settlements';
import type { TrackGuaranteeRow } from '@/lib/guarantees';
import { type StatementLineItem } from '@/lib/statement-line-items';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          execute: (
            input: unknown,
          ) => Record<string, string> | Promise<Record<string, string>>;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const palette = [
  '#00b8a9',
  '#ff4d6d',
  '#7c3aed',
  '#f59e0b',
  '#2563eb',
  '#111827',
  '#34d399',
  '#ec4899',
  '#64748b',
];

const EMPTY_LINE_ITEMS: StatementLineItem[] = [];

const toneClass: Record<StatementMetric['tone'], string> = {
  ink: 'border-l-[#071118]',
  blue: 'border-l-[#2563eb]',
  teal: 'border-l-[#00b8a9]',
  amber: 'border-l-[#f59e0b]',
  rose: 'border-l-[#ff4d6d]',
  violet: 'border-l-[#7c3aed]',
};

const toneDotClass: Record<StatementMetric['tone'], string> = {
  ink: 'bg-[#071118]',
  blue: 'bg-[#2563eb]',
  teal: 'bg-[#00b8a9]',
  amber: 'bg-[#f59e0b]',
  rose: 'bg-[#ff4d6d]',
  violet: 'bg-[#7c3aed]',
};

type DashboardAccessLevel = 'admin' | 'owner' | 'viewer' | 'finance';

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function formatRate(value: number | null) {
  if (value === null) return '-';
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

function vietnamesePeriodLabel(period: string) {
  const match = period.match(/^(20\d{2})-Q([1-4])$/);
  return match ? `Quý ${match[2]}/${match[1]}` : periodDisplayLabel(period);
}

function statusLabel(status: string) {
  if (status === 'published') return 'Đã công bố';
  if (status === 'locked') return 'Đã khóa';
  if (status === 'empty') return 'Chưa có dữ liệu';
  return 'Đang kiểm tra';
}

function accessLevelLabel(accessLevel: DashboardAccessLevel) {
  if (accessLevel === 'admin') return 'Quản trị viên';
  if (accessLevel === 'owner') return 'Chủ tài khoản';
  if (accessLevel === 'finance') return 'Tài chính';
  return 'Người xem';
}

function guaranteeStatusLabel(status: TrackGuaranteeRow['status']) {
  if (status === 'active') return 'Đang trừ GM';
  if (status === 'recouped') return 'Đã thu hồi';
  return 'Đã lưu trữ';
}

function settlementStatusLabel(period: StatementPeriod) {
  if (period.settlementStatus === 'carried_forward') return 'Chuyển kỳ sau';
  return period.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
}

function settlementBadgeClass(period: StatementPeriod) {
  if (period.settlementStatus === 'carried_forward') {
    return 'rounded-lg bg-[#fff8e7] text-[#986200]';
  }

  return period.paymentStatus === 'paid'
    ? 'rounded-lg bg-[#e7fbf7] text-[#00796f]'
    : 'rounded-lg bg-[#fff1f0] text-[#a53a30]';
}

function settlementHelper(period: StatementPeriod) {
  if (period.settlementStatus === 'carried_forward') {
    return `Chuyển quý sau ${formatMoney(period.carryForward)}`;
  }

  if (period.paymentStatus === 'paid') {
    return `Đã thanh toán ${formatMoney(period.paid)}`;
  }

  return `Chờ chuyển khoản ${formatMoney(period.payable)}`;
}

function statementExportUrl(reportPeriodId: string, format: 'excel' | 'pdf') {
  return `/api/statements/${encodeURIComponent(reportPeriodId)}/export?format=${format}`;
}

function makeQuarterCashFlow(activePeriod: StatementPeriod): StatementMetric[] {
  const revenueReduction = Math.max(
    activePeriod.grossRevenue - activePeriod.revenue,
    0,
  );
  const quarterNet =
    activePeriod.revenue -
    activePeriod.costs -
    activePeriod.reservesWithheld +
    activePeriod.reservesReleased;

  return [
    {
      label: 'Tổng doanh thu',
      value: formatMoney(activePeriod.grossRevenue),
      helper: 'Doanh thu gộp ghi nhận trong quý',
      tone: 'ink',
    },
    {
      label: 'Các khoản giảm trừ',
      value: formatMoney(revenueReduction),
      helper: 'Chênh lệch giữa doanh thu gộp và doanh thu ròng',
      tone: 'amber',
    },
    {
      label: 'GM đã khấu trừ',
      value: formatMoney(activePeriod.costs),
      helper: 'Khoản tạm ứng GM được thu hồi trong quý',
      tone: 'rose',
    },
    {
      label: 'Dự phòng giữ lại',
      value: formatMoney(activePeriod.reservesWithheld),
      helper: 'Khoản tạm giữ trong kỳ báo cáo',
      tone: 'violet',
    },
    {
      label: 'Dự phòng hoàn lại',
      value: formatMoney(activePeriod.reservesReleased),
      helper: 'Khoản dự phòng được cộng trả trong quý',
      tone: 'blue',
    },
    {
      label: 'Thực nhận trong quý',
      value: formatMoney(quarterNet),
      helper: 'Doanh thu ròng sau GM và dự phòng',
      tone: 'teal',
    },
  ];
}

function makeSettlementMetrics(
  activePeriod: StatementPeriod,
): StatementMetric[] {
  const unpaid = Math.max(activePeriod.payable - activePeriod.paid, 0);

  return [
    {
      label: 'Số dư đầu kỳ',
      value: formatMoney(activePeriod.opening),
      helper: 'Số tiền được chuyển từ quý trước',
      tone: 'ink',
    },
    {
      label: 'Tổng phải trả',
      value: formatMoney(activePeriod.payable),
      helper: 'Số dư đầu kỳ cộng thực nhận trong quý',
      tone: 'violet',
    },
    {
      label: 'Đã thanh toán',
      value: formatMoney(activePeriod.paid),
      helper:
        activePeriod.paymentStatus === 'paid'
          ? 'Đã chuyển khoản cho khách hàng'
          : 'Chưa phát sinh thanh toán',
      tone: 'teal',
    },
    {
      label: 'Chưa thanh toán',
      value: formatMoney(unpaid),
      helper: 'Tổng phải trả trừ số tiền đã thanh toán',
      tone: 'amber',
    },
    {
      label: 'Chuyển kỳ sau',
      value: formatMoney(activePeriod.carryForward),
      helper: 'Số dư giữ lại khi chưa đạt ngưỡng chuyển khoản',
      tone: 'rose',
    },
  ];
}

function makeEmptyPeriod({
  clientId,
  clientName,
  period,
}: {
  clientId: string;
  clientName: string;
  period: string;
}): StatementPeriod {
  return {
    carryForward: 0,
    clientId,
    clientName,
    closing: 0,
    costs: 0,
    currency: 'VND',
    grossRevenue: 0,
    id: `${clientId}:${period}:VND:empty`,
    label: periodDisplayLabel(period),
    opening: 0,
    paid: 0,
    paidAt: null,
    paymentStatus: 'unpaid',
    payable: 0,
    period,
    revenue: 0,
    reservesReleased: 0,
    reservesWithheld: 0,
    rowCount: 0,
    settlementStatus: 'carried_forward',
    status: 'empty',
    units: 0,
  };
}

type AggregatedLineItem = BreakdownItem & {
  meta?: string;
};

type TrackIdentityRow = {
  isrc: string;
  netPayable: number;
  sales: number;
  trackTitle: string;
  trackVersion: string | null;
};

type SourceInsights = {
  configurations: AggregatedLineItem[];
  contentTypes: AggregatedLineItem[];
  contracts: AggregatedLineItem[];
  financeRows: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  releaseArtists: AggregatedLineItem[];
  salesPeriods: AggregatedLineItem[];
  trackIdentities: TrackIdentityRow[];
};

function makeSourceInsights(items: StatementLineItem[]): SourceInsights {
  const grossIncomeRows = items.filter(
    (item) => typeof item.grossIncome === 'number',
  );
  const royaltyRateRows = items.filter(
    (item) => typeof item.royaltyRate === 'number',
  );
  const grossIncome = grossIncomeRows.reduce(
    (total, item) => total + (item.grossIncome ?? 0),
    0,
  );
  const averageRoyaltyRate =
    royaltyRateRows.length > 0
      ? royaltyRateRows.reduce(
          (total, item) => total + (item.royaltyRate ?? 0),
          0,
        ) / royaltyRateRows.length
      : null;

  return {
    configurations: aggregateLineItems(items, (item) => item.configuration),
    contentTypes: aggregateLineItems(items, (item) => item.contentType),
    contracts: aggregateLineItems(items, (item) => item.contractName),
    financeRows: [
      {
        helper: `${formatNumber(grossIncomeRows.length)} dòng có thu nhập gộp`,
        label: 'Thu nhập gộp',
        value: grossIncomeRows.length > 0 ? formatMoney(grossIncome) : '-',
      },
      {
        helper: `${formatNumber(royaltyRateRows.length)} dòng có tỷ lệ bản quyền`,
        label: 'Tỷ lệ bản quyền trung bình',
        value: formatRate(averageRoyaltyRate),
      },
    ],
    releaseArtists: aggregateLineItems(items, (item) => item.releaseArtist),
    salesPeriods: aggregateLineItems(items, (item) => item.salesPeriod),
    trackIdentities: makeTrackIdentityRows(items),
  };
}

function aggregateLineItems(
  items: StatementLineItem[],
  getName: (item: StatementLineItem) => string | null,
) {
  const rows = new Map<string, AggregatedLineItem>();

  for (const item of items) {
    const name = cleanInsightLabel(getName(item));
    if (!name) continue;

    const current = rows.get(name) ?? {
      name,
      percentage: 0,
      rows: 0,
      units: 0,
      value: 0,
    };
    current.rows += 1;
    current.units += item.sales;
    current.value += item.netPayable;
    rows.set(name, current);
  }

  const result = Array.from(rows.values()).sort((left, right) => {
    return Math.abs(right.value) - Math.abs(left.value);
  });
  const total = result.reduce((sum, row) => sum + Math.abs(row.value), 0);

  return result.map((row) => ({
    ...row,
    percentage: total > 0 ? (Math.abs(row.value) / total) * 100 : 0,
  }));
}

function makeTrackIdentityRows(items: StatementLineItem[]) {
  const rows = new Map<string, TrackIdentityRow>();

  for (const item of items) {
    const isrc = cleanInsightLabel(item.isrc);
    const trackTitle = cleanInsightLabel(item.trackTitle);
    if (!isrc && !trackTitle) continue;

    const key = isrc || `${trackTitle}:${item.trackVersion ?? ''}`;
    const current = rows.get(key) ?? {
      isrc: isrc || '-',
      netPayable: 0,
      sales: 0,
      trackTitle: trackTitle || '-',
      trackVersion: cleanInsightLabel(item.trackVersion),
    };
    current.netPayable += item.netPayable;
    current.sales += item.sales;
    rows.set(key, current);
  }

  return Array.from(rows.values())
    .sort(
      (left, right) => Math.abs(right.netPayable) - Math.abs(left.netPayable),
    )
    .slice(0, 10);
}

function cleanInsightLabel(value: string | null) {
  const label = value?.trim();
  return label ? label : null;
}

function hasSourceInsights(insights: SourceInsights) {
  return (
    insights.configurations.length > 0 ||
    insights.contentTypes.length > 0 ||
    insights.contracts.length > 0 ||
    insights.releaseArtists.length > 0 ||
    insights.salesPeriods.length > 0 ||
    insights.trackIdentities.length > 0 ||
    insights.financeRows.some((row) => row.value !== '-')
  );
}

export function RoyaltyDashboard({
  accessLevel,
  breakdownsByPeriod,
  clientId,
  clientName,
  guarantees = [],
  lineItemsByPeriod = {},
  statementPeriods: statementPeriodsProp,
  trend: trendProp,
  userEmail,
}: {
  accessLevel: DashboardAccessLevel;
  breakdownsByPeriod?: DashboardBreakdownsByPeriod;
  clientId: string;
  clientName: string;
  guarantees?: TrackGuaranteeRow[];
  lineItemsByPeriod?: Record<string, StatementLineItem[]>;
  statementPeriods?: StatementPeriod[];
  trend?: RevenueTrendPoint[];
  userEmail: string;
}) {
  const usesProvidedData = statementPeriodsProp !== undefined;
  const dashboardPeriods = statementPeriodsProp ?? periods;
  const dashboardTrend = trendProp ?? revenueTrend;
  const emptyBreakdowns = useMemo(() => createEmptyCurrencyBreakdowns(), []);
  const assignedClient = clients.find((client) => client.id === clientId) ?? {
    code: clientId,
    id: clientId,
    name: clientName,
  };
  const clientPeriods = useMemo(
    () =>
      dashboardPeriods.filter(
        (period) => period.clientId === assignedClient.id,
      ),
    [assignedClient.id, dashboardPeriods],
  );
  const hasStatements = clientPeriods.length > 0;
  const defaultPeriod = useMemo(() => currentCalendarQuarter(), []);
  const availablePeriods = useMemo(
    () =>
      hasStatements
        ? Array.from(new Set(clientPeriods.map((period) => period.period)))
        : [defaultPeriod],
    [clientPeriods, defaultPeriod, hasStatements],
  );
  const [selectedPeriod, setSelectedPeriod] = useState(
    clientPeriods[0]?.period ?? defaultPeriod,
  );
  const resolvedSelectedPeriod = availablePeriods.includes(selectedPeriod)
    ? selectedPeriod
    : (availablePeriods[0] ?? defaultPeriod);
  const selectedPeriodRows = useMemo(
    () =>
      clientPeriods.filter(
        (period) => period.period === resolvedSelectedPeriod,
      ),
    [clientPeriods, resolvedSelectedPeriod],
  );
  const [activeTab, setActiveTab] = useState<BreakdownKey>('sources');

  const activePeriod =
    selectedPeriodRows.find((period) => period.currency === 'VND') ??
    clientPeriods[0] ??
    makeEmptyPeriod({
      clientId: assignedClient.id,
      clientName: assignedClient.name,
      period: resolvedSelectedPeriod || defaultPeriod,
    });
  const quarterCashFlow = makeQuarterCashFlow(activePeriod);
  const settlementMetrics = makeSettlementMetrics(activePeriod);
  const activeSection =
    breakdownSections.find((section) => section.id === activeTab) ??
    breakdownSections[0];
  const activeBreakdownData =
    breakdownsByPeriod?.[activePeriod.period]?.VND ??
    (usesProvidedData ? emptyBreakdowns : breakdownsByCurrency.VND);
  const activeBreakdown = hasStatements ? activeBreakdownData[activeTab] : [];
  const activeLineItems = hasStatements
    ? (lineItemsByPeriod[activePeriod.period] ?? EMPTY_LINE_ITEMS)
    : EMPTY_LINE_ITEMS;
  const sourceInsights = useMemo(
    () => makeSourceInsights(activeLineItems),
    [activeLineItems],
  );
  const shouldShowSourceInsights = hasSourceInsights(sourceInsights);
  const trendData = hasStatements ? dashboardTrend : [];
  const activeGuarantees = useMemo(
    () => guarantees.filter((guarantee) => guarantee.status !== 'archived'),
    [guarantees],
  );
  const statementPreviewPage = usePaginatedRows(clientPeriods);
  const guaranteePage = usePaginatedRows(activeGuarantees);
  const ledgerPage = usePaginatedRows(clientPeriods);

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'select_statement_scope',
          title: 'Chọn kỳ báo cáo',
          description:
            'Chọn quý báo cáo đang hiển thị trên dashboard chỉ xem của khách hàng.',
          inputSchema: {
            type: 'object',
            properties: {
              period: {
                type: 'string',
                enum: availablePeriods,
              },
            },
            required: ['period'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute(input: unknown) {
            const parsed = parseScopeInput(input, availablePeriods);
            setSelectedPeriod(parsed.period);
            return {
              period: parsed.period,
              status: 'đã chọn',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [availablePeriods]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[88px_minmax(0,1fr)] max-lg:block">
        <ConsoleRail variant="client" />

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 px-5 py-4 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark className="lg:hidden" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Cổng thông tin nghệ sĩ
                  </p>
                  <h1 className="font-display break-words text-xl font-semibold leading-tight md:truncate md:text-3xl">
                    Cổng thông tin nghệ sĩ Zuong Zero
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="h-8 rounded-lg bg-[#e7fbf7] px-3 text-[#00796f]"
                  variant="secondary"
                >
                  <Disc3 className="size-3.5" />
                  Chỉ xem
                </Badge>
                <Badge
                  className="h-8 max-w-[280px] truncate rounded-lg bg-white px-3 text-[#1f2937]"
                  variant="outline"
                >
                  <KeyRound className="size-3.5" />
                  {userEmail}
                </Badge>
                <Badge className="h-8 rounded-lg" variant="outline">
                  {accessLevelLabel(accessLevel)}
                </Badge>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
                  onClick={() => {
                    window.location.assign('/account');
                  }}
                  type="button"
                >
                  <Settings className="size-4" />
                  Tài khoản
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
                  onClick={() => {
                    window.location.assign('/api/auth/logout?return_to=/login');
                  }}
                  type="button"
                >
                  <LogOut className="size-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-5 px-5 py-5 md:px-8 md:py-7">
            <section
              className="music-card scroll-mt-24 overflow-hidden"
              id="client-overview"
            >
              <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className="rounded-lg bg-[#e7fbf7] text-[#00796f]"
                          variant="secondary"
                        >
                          <WalletCards className="size-3.5" />
                          Danh mục
                        </Badge>
                        <Badge className="rounded-lg" variant="outline">
                          {assignedClient.code}
                        </Badge>
                      </div>
                      <h2 className="font-display mt-4 truncate text-2xl font-semibold md:text-3xl">
                        {assignedClient.name}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Báo cáo {vietnamesePeriodLabel(activePeriod.period)}
                      </p>
                    </div>
                    <div className="flex min-w-[170px] items-center justify-between gap-3 rounded-lg border border-[#bce9e4] bg-[#f0fffc] px-3 py-2 text-sm font-medium text-[#047a70]">
                      <CheckCircle2 className="size-4" />
                      {statusLabel(activePeriod.status)}
                    </div>
                    <Badge
                      className={settlementBadgeClass(activePeriod)}
                      variant="secondary"
                    >
                      {settlementStatusLabel(activePeriod)}
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-[190px]">
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Filter className="size-4 text-primary" />
                        Quý
                      </span>
                      <Select
                        onValueChange={(value) => {
                          if (value) setSelectedPeriod(value);
                        }}
                        value={resolvedSelectedPeriod}
                      >
                        <SelectTrigger
                          aria-label="Quý báo cáo"
                          className="music-control h-10 w-full"
                        >
                          <SelectValue>
                            {vietnamesePeriodLabel(resolvedSelectedPeriod)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availablePeriods.map((period) => {
                            return (
                              <SelectItem key={period} value={period}>
                                {vietnamesePeriodLabel(period)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 bg-[#071118] p-5 text-white lg:border-l lg:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <RadioTower className="size-4 text-[#00b8a9]" />
                      Tóm tắt dữ liệu
                    </div>
                    <Badge className="rounded-lg border-white/15 bg-white/10 text-white">
                      {hasStatements ? 'Đã có dữ liệu' : 'Chưa có dữ liệu'}
                    </Badge>
                  </div>
                  <EqualizerBars className="mt-7" />
                  <dl className="mt-7 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-white/55">Số dòng dữ liệu</dt>
                      <dd className="mt-1 text-xl font-semibold">
                        {formatNumber(activePeriod.rowCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-white/55">Lượt khai thác</dt>
                      <dd className="mt-1 text-xl font-semibold">
                        {formatNumber(activePeriod.units)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            <section aria-labelledby="quarter-cash-flow-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Dòng tiền trong quý
                  </p>
                  <h2
                    className="mt-1 text-lg font-semibold"
                    id="quarter-cash-flow-title"
                  >
                    Từ doanh thu đến thực nhận
                  </h2>
                </div>
                <Badge className="rounded-lg" variant="outline">
                  {vietnamesePeriodLabel(activePeriod.period)}
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {quarterCashFlow.map((metric, index) => (
                  <FinancialMetricCard
                    index={index + 1}
                    key={metric.label}
                    metric={metric}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="settlement-summary-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Thanh toán và số dư
                  </p>
                  <h2
                    className="mt-1 text-lg font-semibold"
                    id="settlement-summary-title"
                  >
                    Tình trạng đối soát
                  </h2>
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  Ngưỡng chuyển khoản {formatMoney(SETTLEMENT_THRESHOLD_VND)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {settlementMetrics.map((metric) => (
                  <FinancialMetricCard key={metric.label} metric={metric} />
                ))}
              </div>
            </section>

            <section
              className="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]"
              id="client-statements"
            >
              <section className="music-card p-4 md:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Doanh thu
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      Xu hướng theo quý
                    </h2>
                  </div>
                  <TrendingUp className="size-5 text-primary" />
                </div>
                <RevenueTrendChart data={trendData} />
              </section>

              <section className="music-card p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <BarChart3 className="mt-0.5 size-5 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Báo cáo
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      Báo cáo gần đây
                    </h2>
                  </div>
                </div>
                <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {clientPeriods.length > 0 ? (
                    statementPreviewPage.visibleRows.map((period) => (
                      <div className="bg-white px-3 py-3" key={period.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            {vietnamesePeriodLabel(period.period)}
                          </p>
                          <Badge className="rounded-lg" variant="outline">
                            {statusLabel(period.status)}
                          </Badge>
                        </div>
                        <p className="font-display mt-2 text-xl font-semibold">
                          {settlementStatusLabel(period)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {settlementHelper(period)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                            href={statementExportUrl(period.id, 'pdf')}
                          >
                            <Download className="size-3.5" />
                            PDF
                          </a>
                          <a
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                            href={statementExportUrl(period.id, 'excel')}
                          >
                            <FileSpreadsheet className="size-3.5" />
                            Excel
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex min-h-[210px] items-center justify-center bg-white px-4 text-center">
                      <div>
                        <FileSpreadsheet className="mx-auto size-8 text-primary" />
                        <p className="mt-3 text-sm font-medium">
                          Chưa có báo cáo
                        </p>
                      </div>
                    </div>
                  )}
                  <TablePagination
                    {...statementPreviewPage}
                    itemLabel="báo cáo"
                  />
                </div>
              </section>
            </section>

            {activeGuarantees.length > 0 ? (
              <section className="music-card p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      GM
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      Khoản đảm bảo tối thiểu
                    </h2>
                  </div>
                  <WalletCards className="size-5 text-[#ff4d6d]" />
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bài hát</TableHead>
                        <TableHead>GM</TableHead>
                        <TableHead>Đã trừ</TableHead>
                        <TableHead>Còn lại</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guaranteePage.visibleRows.map((guarantee) => (
                        <TableRow key={guarantee.id}>
                          <TableCell className="font-medium">
                            <span className="block">
                              {guarantee.trackTitle}
                            </span>
                            {guarantee.trackExternalId ? (
                              <span className="block text-xs text-muted-foreground">
                                ID: {guarantee.trackExternalId}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {formatMoney(guarantee.initialAmount)}
                          </TableCell>
                          <TableCell>
                            {formatMoney(guarantee.recoupedAmount)}
                          </TableCell>
                          <TableCell>
                            {formatMoney(guarantee.balanceAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge className="rounded-lg" variant="outline">
                              {guaranteeStatusLabel(guarantee.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination {...guaranteePage} itemLabel="GM" />
                </div>
              </section>
            ) : null}

            <Tabs
              className="music-card p-4 md:p-5"
              id="client-breakdown"
              onValueChange={(value) => setActiveTab(value as BreakdownKey)}
              value={activeTab}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Phân tích
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Phân tích doanh thu
                  </h2>
                </div>
                <TabsList className="h-auto flex-wrap justify-start">
                  {breakdownSections.map((section) => (
                    <TabsTrigger key={section.id} value={section.id}>
                      {section.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent className="mt-5" value={activeTab}>
                <BreakdownChart
                  chartType={activeSection.chartType}
                  data={activeBreakdown}
                  section={activeSection}
                />
              </TabsContent>
            </Tabs>

            {shouldShowSourceInsights ? (
              <section className="grid gap-4 xl:grid-cols-2">
                {sourceInsights.salesPeriods.length > 0 ? (
                  <MiniBreakdownPanel
                    data={sourceInsights.salesPeriods}
                    eyebrow="Kỳ phát sinh"
                    title="Doanh thu theo tháng phát sinh"
                  />
                ) : null}

                {sourceInsights.releaseArtists.length > 0 ? (
                  <MiniBreakdownPanel
                    data={sourceInsights.releaseArtists}
                    eyebrow="Nghệ sĩ phát hành"
                    title="Nghệ sĩ phát hành nổi bật"
                  />
                ) : null}

                {sourceInsights.contentTypes.length > 0 ? (
                  <MiniBreakdownPanel
                    data={sourceInsights.contentTypes}
                    eyebrow="Loại nội dung"
                    title="Loại nội dung"
                  />
                ) : null}

                {sourceInsights.configurations.length > 0 ? (
                  <MiniBreakdownPanel
                    data={sourceInsights.configurations}
                    eyebrow="Cấu hình khai thác"
                    title="Cấu hình khai thác bổ sung"
                  />
                ) : null}

                {sourceInsights.contracts.length > 0 ? (
                  <MiniTablePanel
                    eyebrow="Hợp đồng"
                    rows={sourceInsights.contracts}
                    title="Hợp đồng trong báo cáo"
                  />
                ) : null}

                {sourceInsights.trackIdentities.length > 0 ? (
                  <TrackIdentityPanel rows={sourceInsights.trackIdentities} />
                ) : null}

                <SourceFinancePanel rows={sourceInsights.financeRows} />
              </section>
            ) : null}

            <section className="music-card p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Sổ báo cáo
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Lịch sử báo cáo
                  </h2>
                </div>
                <Users className="size-5 text-primary" />
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quý</TableHead>
                      <TableHead>Số dòng</TableHead>
                      <TableHead>Lượt khai thác</TableHead>
                      <TableHead>Doanh thu ròng</TableHead>
                      <TableHead>GM</TableHead>
                      <TableHead>Phải trả</TableHead>
                      <TableHead>Đối soát</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Tải xuống</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPeriods.length > 0 ? (
                      ledgerPage.visibleRows.map((period) => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium">
                            {vietnamesePeriodLabel(period.period)}:{' '}
                            {period.clientName}
                          </TableCell>
                          <TableCell>{formatNumber(period.rowCount)}</TableCell>
                          <TableCell>{formatNumber(period.units)}</TableCell>
                          <TableCell>{formatMoney(period.revenue)}</TableCell>
                          <TableCell>
                            {period.costs > 0 ? formatMoney(period.costs) : '-'}
                          </TableCell>
                          <TableCell>{formatMoney(period.payable)}</TableCell>
                          <TableCell>
                            <Badge
                              className={settlementBadgeClass(period)}
                              variant="secondary"
                            >
                              {settlementStatusLabel(period)}
                            </Badge>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {settlementHelper(period)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className="rounded-lg" variant="outline">
                              {statusLabel(period.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <a
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                                href={statementExportUrl(period.id, 'pdf')}
                              >
                                <Download className="size-3.5" />
                                PDF
                              </a>
                              <a
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                                href={statementExportUrl(period.id, 'excel')}
                              >
                                <FileSpreadsheet className="size-3.5" />
                                Excel
                              </a>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          className="h-24 text-center text-sm text-muted-foreground"
                          colSpan={9}
                        >
                          Chưa có báo cáo cho khách hàng này.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <TablePagination {...ledgerPage} itemLabel="báo cáo" />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function FinancialMetricCard({
  index,
  metric,
}: {
  index?: number;
  metric: StatementMetric;
}) {
  return (
    <article
      className={`music-card min-h-[142px] border-l-4 p-4 ${toneClass[metric.tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase leading-5 tracking-[0.14em] text-muted-foreground">
          {metric.label}
        </p>
        {index ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">
            {index}
          </span>
        ) : (
          <span
            className={`size-2.5 shrink-0 rounded-full ${toneDotClass[metric.tone]}`}
          />
        )}
      </div>
      <p className="font-display mt-5 break-words text-2xl font-semibold leading-tight">
        {metric.value}
      </p>
      <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground">
        {metric.helper}
      </p>
    </article>
  );
}

function parseScopeInput(input: unknown, periods: string[]) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object.');
  }

  const candidate = input as {
    period?: unknown;
  };
  if (
    typeof candidate.period !== 'string' ||
    !periods.includes(candidate.period)
  ) {
    throw new Error('Invalid period.');
  }

  return {
    period: candidate.period,
  };
}

function MiniBreakdownPanel({
  data,
  eyebrow,
  title,
}: {
  data: AggregatedLineItem[];
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        <Badge className="rounded-lg" variant="outline">
          {Math.min(data.length, 8)} mục nổi bật
        </Badge>
      </div>
      <div className="min-h-[260px] rounded-lg border border-border bg-white p-4">
        <RankedBreakdown data={data.slice(0, 8)} />
      </div>
    </section>
  );
}

function MiniTablePanel({
  eyebrow,
  rows,
  title,
}: {
  eyebrow: string;
  rows: AggregatedLineItem[];
  title: string;
}) {
  const page = usePaginatedRows(rows);

  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        <Badge className="rounded-lg" variant="outline">
          {formatNumber(rows.length)} mục
        </Badge>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Doanh thu ròng</TableHead>
              <TableHead>Lượt khai thác</TableHead>
              <TableHead>Dòng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.visibleRows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-[240px] truncate font-medium">
                  {row.name}
                </TableCell>
                <TableCell>{formatMoney(row.value)}</TableCell>
                <TableCell>{formatNumber(row.units)}</TableCell>
                <TableCell>{formatNumber(row.rows)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...page} itemLabel="mục" />
      </div>
    </section>
  );
}

function TrackIdentityPanel({ rows }: { rows: TrackIdentityRow[] }) {
  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            ISRC / Phiên bản
          </p>
          <h2 className="mt-1 text-lg font-semibold">Theo dõi bài hát</h2>
        </div>
        <Badge className="rounded-lg" variant="outline">
          {formatNumber(rows.length)} bài hát nổi bật
        </Badge>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bài hát</TableHead>
              <TableHead>ISRC</TableHead>
              <TableHead>Phiên bản</TableHead>
              <TableHead>Doanh thu ròng</TableHead>
              <TableHead>Lượt khai thác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.isrc}:${row.trackTitle}`}>
                <TableCell className="max-w-[220px] truncate font-medium">
                  {row.trackTitle}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.isrc}</TableCell>
                <TableCell>{row.trackVersion ?? '-'}</TableCell>
                <TableCell>{formatMoney(row.netPayable)}</TableCell>
                <TableCell>{formatNumber(row.sales)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function SourceFinancePanel({ rows }: { rows: SourceInsights['financeRows'] }) {
  const visibleRows = rows.filter((row) => row.value !== '-');
  if (visibleRows.length === 0) return null;

  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Doanh thu / Bản quyền
        </p>
        <h2 className="mt-1 text-lg font-semibold">Chỉ số tài chính bổ sung</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chỉ số</TableHead>
              <TableHead>Giá trị</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>{row.value}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.helper}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BreakdownChart({
  data,
  chartType,
  section,
}: {
  data: BreakdownItem[];
  chartType: BreakdownSection['chartType'];
  section: BreakdownSection;
}) {
  const breakdownPage = usePaginatedRows(data);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
      <div className="min-h-[360px] min-w-0 rounded-lg border border-border bg-white p-3">
        {chartType === 'donut' ? (
          <DonutChart data={data} />
        ) : chartType === 'ranked' ? (
          <RankedBreakdown data={data} />
        ) : (
          <BarBreakdown data={data} />
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/35 px-4 py-3">
          <p className="text-sm font-semibold">{section.label}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loại</TableHead>
              <TableHead>Giá trị</TableHead>
              <TableHead>Lượt khai thác</TableHead>
              <TableHead>%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdownPage.visibleRows.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{formatMoney(item.value)}</TableCell>
                <TableCell>{formatNumber(item.units)}</TableCell>
                <TableCell>{item.percentage.toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...breakdownPage} itemLabel="dòng" />
      </div>
    </div>
  );
}

function RevenueTrendChart({ data }: { data: typeof revenueTrend }) {
  const values = data.map((item) => item.vnd);
  const maxValue = Math.max(...values, 1);

  return (
    <div className="grid h-[330px] grid-cols-[56px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-3 overflow-visible pb-3">
        {data.map((item, index) => {
          const value = item.vnd;
          const tooltip = `${vietnamesePeriodLabel(item.period)}: ${formatMoney(value)} / ${formatNumber(item.units)} lượt khai thác`;
          return (
            <div
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              key={item.period}
            >
              <div className="flex h-[250px] w-full items-end border-b border-border">
                <div
                  aria-label={`${vietnamesePeriodLabel(item.period)}: ${formatMoney(value)}`}
                  className="group relative flex h-full w-full items-end"
                  title={tooltip}
                >
                  <ChartHoverTooltip
                    label={vietnamesePeriodLabel(item.period)}
                    meta={`${formatNumber(item.units)} lượt khai thác`}
                    value={formatMoney(value)}
                  />
                  <div
                    className="w-full rounded-t-md transition-opacity group-hover:opacity-85"
                    style={{
                      backgroundColor: palette[index % palette.length],
                      height: `${Math.max(4, (value / maxValue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="w-full truncate text-center text-xs text-muted-foreground">
                {vietnamesePeriodLabel(item.period)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarBreakdown({ data }: { data: BreakdownItem[] }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="grid h-[330px] grid-cols-[48px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-2 overflow-visible pb-3">
        {data.map((item, index) => (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={item.name}
          >
            <div className="flex h-[250px] w-full items-end border-b border-border">
              <div
                aria-label={`${item.name}: ${formatMoney(item.value)}`}
                className="group relative flex h-full w-full items-end"
                title={`${item.name}: ${formatMoney(item.value)} / ${formatNumber(item.units)} lượt khai thác / ${item.percentage.toFixed(2)}%`}
              >
                <ChartHoverTooltip
                  label={item.name}
                  meta={`${formatNumber(item.units)} lượt khai thác / ${item.percentage.toFixed(2)}%`}
                  value={formatMoney(item.value)}
                />
                <div
                  className="w-full rounded-t-md transition-opacity group-hover:opacity-85"
                  style={{
                    backgroundColor: palette[index % palette.length],
                    height: `${Math.max(4, (item.value / maxValue) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {item.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedBreakdown({ data }: { data: BreakdownItem[] }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="flex h-full min-h-[330px] flex-col justify-center gap-3">
      {data.map((item, index) => (
        <div className="grid gap-2" key={item.name}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">
              {item.name}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {formatMoney(item.value)}
            </span>
          </div>
          <div
            className="group relative h-3 rounded-full bg-muted"
            title={`${item.name}: ${formatMoney(item.value)} / ${formatNumber(item.units)} lượt khai thác / ${item.percentage.toFixed(2)}%`}
          >
            <ChartHoverTooltip
              label={item.name}
              meta={`${formatNumber(item.units)} lượt khai thác / ${item.percentage.toFixed(2)}%`}
              value={formatMoney(item.value)}
            />
            <div
              aria-label={`${item.name}: ${item.percentage.toFixed(2)}%`}
              className="h-full rounded-full"
              style={{
                backgroundColor: palette[index % palette.length],
                width: `${Math.max(4, (item.value / maxValue) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: BreakdownItem[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[330px] items-center justify-center">
        <div
          aria-label="Tỷ trọng doanh thu: chưa có dữ liệu"
          className="relative size-[230px] rounded-full border border-border bg-muted"
        >
          <div className="absolute inset-[64px] rounded-full border border-border bg-white" />
        </div>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 88;
  const donutSegments = data.reduce(
    (state, item, index) => {
      const segment = (item.percentage / 100) * circumference;
      const dash = Math.max(0, segment - (data.length > 1 ? 2 : 0));

      return {
        offset: state.offset + segment,
        segments: [
          ...state.segments,
          {
            dash,
            dashOffset: -state.offset,
            index,
            item,
          },
        ],
      };
    },
    {
      offset: 0,
      segments: [] as Array<{
        dash: number;
        dashOffset: number;
        index: number;
        item: BreakdownItem;
      }>,
    },
  ).segments;
  const activeItem = activeIndex === null ? null : (data[activeIndex] ?? null);

  return (
    <div className="flex h-full min-h-[330px] flex-col items-center justify-center gap-4">
      <div className="relative size-[240px]">
        <svg
          aria-label="Tỷ trọng doanh thu"
          className="size-full -rotate-90 overflow-visible"
          viewBox="0 0 240 240"
        >
          <circle
            className="stroke-muted"
            cx="120"
            cy="120"
            fill="none"
            r="88"
            strokeWidth="48"
          />
          {donutSegments.map(({ dash, dashOffset, index, item }) => (
            <circle
              aria-label={`${item.name}: ${formatMoney(item.value)}, ${item.percentage.toFixed(2)}%`}
              className="cursor-pointer transition-opacity hover:opacity-80"
              cx="120"
              cy="120"
              fill="none"
              key={item.name}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              r="88"
              stroke={palette[index % palette.length]}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              strokeWidth="48"
            >
              <title>
                {item.name}: {formatMoney(item.value)} /{' '}
                {formatNumber(item.units)} lượt khai thác /{' '}
                {item.percentage.toFixed(2)}%
              </title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-[64px] flex flex-col items-center justify-center rounded-full border border-border bg-white px-3 text-center">
          {activeItem ? (
            <>
              <p className="w-full truncate text-xs font-medium text-muted-foreground">
                {activeItem.name}
              </p>
              <p className="font-display mt-1 text-lg font-semibold">
                {activeItem.percentage.toFixed(2)}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(activeItem.value)}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                Tổng tỷ trọng
              </p>
              <p className="font-display mt-1 text-lg font-semibold">100%</p>
            </>
          )}
        </div>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {data.map((item, index) => (
          <div
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-muted/60"
            key={item.name}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: palette[index % palette.length] }}
            />
            <span className="truncate text-xs text-muted-foreground">
              {item.name} - {item.percentage.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
