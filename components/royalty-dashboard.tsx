'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Coins,
  Database,
  Eye,
  Filter,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  breakdownSections,
  breakdownsByCurrency,
  clients,
  periods,
  revenueTrend,
  type BreakdownItem,
  type BreakdownKey,
  type BreakdownSection,
  type CurrencyCode,
  type StatementMetric,
} from '@/lib/dashboard-data';

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
  '#4b9db0',
  '#f0b33f',
  '#4f6a8b',
  '#d95d52',
  '#24a37d',
  '#7f6ab5',
  '#a5b665',
  '#d67ba8',
  '#35424a',
];

const currencies: CurrencyCode[] = ['USD', 'VND'];

const toneClass: Record<StatementMetric['tone'], string> = {
  ink: 'bg-[#27313a] text-white',
  blue: 'bg-[#2f8fcc] text-white',
  teal: 'bg-[#12a990] text-white',
  amber: 'bg-[#c9851f] text-white',
  rose: 'bg-[#b95763] text-white',
  violet: 'bg-[#7a67ad] text-white',
};

type DashboardAccessLevel = 'admin' | 'owner' | 'viewer' | 'finance';

function formatMoney(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function statusLabel(status: string) {
  if (status === 'published') return 'Published';
  if (status === 'locked') return 'Locked';
  return 'Validating';
}

function makeMetrics(
  activePeriod: (typeof periods)[number],
): StatementMetric[] {
  return [
    {
      label: 'Opening Balance',
      value: formatMoney(activePeriod.opening, activePeriod.currency),
      helper: 'Số dư đầu kỳ đã khóa',
      tone: 'ink',
    },
    {
      label: 'Net Payable',
      value: formatMoney(activePeriod.revenue, activePeriod.currency),
      helper: 'Từ cột Net Payable',
      tone: 'blue',
    },
    {
      label: 'Units',
      value: formatNumber(activePeriod.units),
      helper: 'Tổng Units của kỳ',
      tone: 'violet',
    },
    {
      label: 'Source Rows',
      value: formatNumber(activePeriod.rowCount),
      helper: 'Dòng dữ liệu đã import',
      tone: 'amber',
    },
    {
      label: 'Net Costs',
      value: formatMoney(activePeriod.costs, activePeriod.currency),
      helper: 'Chưa có cột cost trong file mẫu',
      tone: 'rose',
    },
    {
      label: 'Closing Balance',
      value: formatMoney(activePeriod.closing, activePeriod.currency),
      helper: 'Opening + payable - costs',
      tone: 'teal',
    },
  ];
}

export function RoyaltyDashboard({
  accessLevel,
  clientId,
  clientName,
  userEmail,
}: {
  accessLevel: DashboardAccessLevel;
  clientId: string;
  clientName: string;
  userEmail: string;
}) {
  const assignedClient = clients.find((client) => client.id === clientId) ?? {
    code: clientId,
    id: clientId,
    name: clientName,
  };
  const clientPeriods = useMemo(
    () => periods.filter((period) => period.clientId === assignedClient.id),
    [assignedClient.id],
  );
  const months = useMemo(
    () => Array.from(new Set(clientPeriods.map((period) => period.period))),
    [clientPeriods],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    clientPeriods[0]?.period ?? '',
  );
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [activeTab, setActiveTab] = useState<BreakdownKey>('sources');

  const activePeriod =
    clientPeriods.find(
      (period) =>
        period.period === selectedMonth && period.currency === selectedCurrency,
    ) ??
    clientPeriods.find((period) => period.period === selectedMonth) ??
    clientPeriods[0];
  const metrics = activePeriod ? makeMetrics(activePeriod) : [];
  const activeSection =
    breakdownSections.find((section) => section.id === activeTab) ??
    breakdownSections[0];
  const activeBreakdown = breakdownsByCurrency[selectedCurrency][activeTab];

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'select_statement_scope',
          title: 'Select statement scope',
          description:
            'Select the visible read-only reporting month and currency in the client royalty dashboard.',
          inputSchema: {
            type: 'object',
            properties: {
              month: {
                type: 'string',
                enum: months,
              },
              currency: {
                type: 'string',
                enum: currencies,
              },
            },
            required: ['month', 'currency'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute(input: unknown) {
            const parsed = parseScopeInput(input, months);
            setSelectedMonth(parsed.month);
            setSelectedCurrency(parsed.currency);
            return {
              month: parsed.month,
              currency: parsed.currency,
              status: 'selected',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [months]);

  if (!activePeriod) {
    return (
      <NoStatements
        accessLevel={accessLevel}
        clientCode={assignedClient.code}
        clientName={assignedClient.name}
        userEmail={userEmail}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[76px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex flex-col items-center gap-3 border-r border-border bg-sidebar px-3 py-5 max-lg:hidden">
          <div className="mb-5 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          {[
            ['Dashboard', Eye],
            ['Statements', BarChart3],
            ['Access', LockKeyhole],
            ['Audit', Fingerprint],
          ].map(([label, Icon], index) => {
            const ItemIcon = Icon as typeof BarChart3;
            return (
              <Button
                aria-label={String(label)}
                className={
                  index === 0
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : ''
                }
                key={String(label)}
                size="icon"
                variant="ghost"
              >
                <ItemIcon className="size-5" />
              </Button>
            );
          })}
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-4 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Client Portal
                </p>
                <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
                  Royalty dashboard
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="h-7 rounded-lg bg-[#e9f7f2] px-3 text-[#22735f]"
                  variant="secondary"
                >
                  <Eye className="size-3.5" />
                  Read-only
                </Badge>
                <Badge
                  className="h-7 rounded-lg bg-primary/10 px-3 text-primary"
                  variant="secondary"
                >
                  <KeyRound className="size-3.5" />
                  {userEmail}
                </Badge>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-5 md:px-8 md:py-7">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {assignedClient.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activePeriod.label}: {activePeriod.currency} statement
                    </p>
                  </div>
                  <Badge className="rounded-lg" variant="outline">
                    {assignedClient.code}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-[180px_150px_160px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Filter className="size-4 text-primary" />
                      Tháng
                    </span>
                    <Select
                      onValueChange={(value) => {
                        if (value) setSelectedMonth(value);
                      }}
                      value={selectedMonth}
                    >
                      <SelectTrigger
                        aria-label="Tháng báo cáo"
                        className="h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((month) => {
                          const label =
                            periods.find((period) => period.period === month)
                              ?.label ?? month;
                          return (
                            <SelectItem key={month} value={month}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Coins className="size-4 text-primary" />
                      Currency
                    </span>
                    <Select
                      onValueChange={(value) => {
                        if (value === 'USD' || value === 'VND') {
                          setSelectedCurrency(value);
                        }
                      }}
                      value={selectedCurrency}
                    >
                      <SelectTrigger
                        aria-label="Loại tiền"
                        className="h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-sm font-medium">
                      Trạng thái
                    </span>
                    <div className="flex h-10 items-center rounded-lg border border-[#b7d8c2] bg-[#f1faf3] px-3 text-sm font-medium text-[#2f6f45]">
                      <CheckCircle2 className="mr-2 size-4" />
                      {statusLabel(activePeriod.status)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-sm font-medium">
                      Quyền truy cập
                    </span>
                    <div className="flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
                      {accessLevel === 'admin'
                        ? 'Admin preview read-only cho client này.'
                        : `${accessLevel}: chỉ xem statement đã publish cho client được gán.`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#b7d8c2] bg-[#f1faf3] p-4 shadow-sm md:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#2f6f45] text-white">
                    <LockKeyhole className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#183d27]">
                      Không có quyền upload
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[#326247]">
                      File Excel và dữ liệu raw chỉ nằm trong khu admin. Portal
                      này chỉ render số đã tổng hợp theo tháng và currency.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {metrics.map((metric) => (
                <article
                  className={`min-h-[132px] rounded-lg p-4 shadow-sm ${toneClass[metric.tone]}`}
                  key={metric.label}
                >
                  <p className="text-sm font-semibold uppercase">
                    {metric.label}
                  </p>
                  <p className="mt-5 text-3xl font-semibold tracking-normal">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-sm opacity-80">{metric.helper}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Monthly trend</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tách USD và VND, không cộng lẫn khi chưa có FX mapping.
                    </p>
                  </div>
                  <TrendingUp className="size-5 text-primary" />
                </div>
                <RevenueTrendChart
                  currency={selectedCurrency}
                  data={revenueTrend}
                />
              </section>

              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 size-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">
                      Statement mới nhất
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mỗi tháng có statement riêng theo từng currency.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {clientPeriods.slice(0, 6).map((period) => (
                    <div
                      className="rounded-lg border border-border bg-background px-3 py-3"
                      key={period.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {period.label} - {period.currency}
                        </p>
                        <Badge className="rounded-lg" variant="outline">
                          {statusLabel(period.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xl font-semibold">
                        {formatMoney(period.closing, period.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <Tabs
              className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5"
              onValueChange={(value) => setActiveTab(value as BreakdownKey)}
              value={activeTab}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Phân tích doanh thu</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Biểu đồ được bố trí theo các cột có trong file mẫu.
                  </p>
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
                  currency={selectedCurrency}
                  data={activeBreakdown}
                  section={activeSection}
                />
              </TabsContent>
            </Tabs>

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Latest statements</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Portal khách hàng không có thao tác upload, sửa, replace
                    hoặc publish.
                  </p>
                </div>
                <Users className="size-5 text-primary" />
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Net Payable</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPeriods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {period.label}: {period.clientName}
                      </TableCell>
                      <TableCell>{period.currency}</TableCell>
                      <TableCell>{formatNumber(period.rowCount)}</TableCell>
                      <TableCell>{formatNumber(period.units)}</TableCell>
                      <TableCell>
                        {formatMoney(period.revenue, period.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className="rounded-lg" variant="outline">
                          {statusLabel(period.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function NoStatements({
  accessLevel,
  clientCode,
  clientName,
  userEmail,
}: {
  accessLevel: DashboardAccessLevel;
  clientCode: string;
  clientName: string;
  userEmail: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <section className="w-full max-w-3xl rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Client Portal
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Chưa có statement đã publish
            </h1>
          </div>
          <Badge className="rounded-lg" variant="outline">
            {clientCode}
          </Badge>
        </div>
        <div className="mt-5 rounded-lg border border-[#b7d8c2] bg-[#f1faf3] p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-5 text-[#2f6f45]" />
            <div>
              <h2 className="font-semibold text-[#183d27]">{clientName}</h2>
              <p className="mt-2 text-sm leading-6 text-[#326247]">
                Tài khoản {userEmail} đã được xác thực với quyền {accessLevel},
                nhưng chưa có kỳ báo cáo nào được admin publish cho client này.
                Dashboard không hiển thị dữ liệu mẫu hoặc dữ liệu của client
                khác.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function parseScopeInput(input: unknown, months: string[]) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object.');
  }

  const candidate = input as {
    month?: unknown;
    currency?: unknown;
  };
  if (
    typeof candidate.month !== 'string' ||
    !months.includes(candidate.month)
  ) {
    throw new Error('Invalid month.');
  }
  if (candidate.currency !== 'USD' && candidate.currency !== 'VND') {
    throw new Error('Invalid currency.');
  }

  return {
    month: candidate.month,
    currency: candidate.currency as CurrencyCode,
  };
}

function BreakdownChart({
  data,
  chartType,
  currency,
  section,
}: {
  data: BreakdownItem[];
  chartType: BreakdownSection['chartType'];
  currency: CurrencyCode;
  section: BreakdownSection;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
      <div className="min-h-[360px] min-w-0 rounded-lg border border-border bg-background p-3">
        {chartType === 'donut' ? (
          <DonutChart data={data} />
        ) : chartType === 'ranked' ? (
          <RankedBreakdown currency={currency} data={data} />
        ) : (
          <BarBreakdown currency={currency} data={data} />
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/35 px-4 py-3">
          <p className="text-sm font-semibold">{section.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source column: {section.sourceColumn}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{formatMoney(item.value, currency)}</TableCell>
                <TableCell>{formatNumber(item.units)}</TableCell>
                <TableCell>{item.percentage.toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RevenueTrendChart({
  data,
  currency,
}: {
  data: typeof revenueTrend;
  currency: CurrencyCode;
}) {
  const values = data.map((item) => (currency === 'USD' ? item.usd : item.vnd));
  const maxValue = Math.max(...values, 1);

  return (
    <div className="grid h-[330px] grid-cols-[56px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-3 overflow-hidden pb-3">
        {data.map((item, index) => {
          const value = currency === 'USD' ? item.usd : item.vnd;
          return (
            <div
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              key={item.period}
            >
              <div className="flex h-[250px] w-full items-end border-b border-border">
                <div
                  aria-label={`${item.label}: ${formatMoney(value, currency)}`}
                  className="w-full rounded-t-md"
                  style={{
                    backgroundColor: palette[index % palette.length],
                    height: `${Math.max(4, (value / maxValue) * 100)}%`,
                  }}
                />
              </div>
              <span className="w-full truncate text-center text-xs text-muted-foreground">
                {item.label.replace('202', "'2")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarBreakdown({
  data,
  currency,
}: {
  data: BreakdownItem[];
  currency: CurrencyCode;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="grid h-[330px] grid-cols-[48px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-2 overflow-hidden pb-3">
        {data.map((item, index) => (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={item.name}
          >
            <div className="flex h-[250px] w-full items-end border-b border-border">
              <div
                aria-label={`${item.name}: ${formatMoney(item.value, currency)}`}
                className="w-full rounded-t-md"
                style={{
                  backgroundColor: palette[index % palette.length],
                  height: `${Math.max(4, (item.value / maxValue) * 100)}%`,
                }}
              />
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

function RankedBreakdown({
  data,
  currency,
}: {
  data: BreakdownItem[];
  currency: CurrencyCode;
}) {
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
              {formatMoney(item.value, currency)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
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
  const stops = data
    .map((item, index) => {
      const start = data
        .slice(0, index)
        .reduce((total, entry) => total + entry.percentage, 0);
      const end = start + item.percentage;
      const color = palette[index % palette.length];
      return `${color} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className="flex h-full min-h-[330px] flex-col items-center justify-center gap-4">
      <div
        aria-label="Revenue share"
        className="relative size-[230px] rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="absolute inset-[64px] rounded-full border border-border bg-background" />
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {data.map((item, index) => (
          <div className="flex min-w-0 items-center gap-2" key={item.name}>
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
