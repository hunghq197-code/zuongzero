'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Database,
  Eye,
  Filter,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
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
  clients,
  configurations,
  metrics,
  periods,
  sources,
  territories,
  type BreakdownItem,
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
  '#f5b642',
  '#4f6a8b',
  '#d95d52',
  '#24a37d',
  '#7f6ab5',
  '#a5b665',
  '#d67ba8',
  '#35424a',
];

const toneClass: Record<StatementMetric['tone'], string> = {
  ink: 'bg-[#27313a] text-white',
  blue: 'bg-[#2f8fcc] text-white',
  teal: 'bg-[#12a990] text-white',
  amber: 'bg-[#c9851f] text-white',
  rose: 'bg-[#b95763] text-white',
  violet: 'bg-[#7a67ad] text-white',
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function statusLabel(status: string) {
  if (status === 'published') return 'Published';
  if (status === 'locked') return 'Locked';
  return 'Validating';
}

export function RoyaltyDashboard({ userEmail }: { userEmail: string }) {
  const assignedClient = clients[0];
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0].id);
  const [activeTab, setActiveTab] = useState<
    'sources' | 'configurations' | 'territories'
  >('sources');

  const activePeriod =
    periods.find((period) => period.id === selectedPeriod) ?? periods[0];
  const activeBreakdown = useMemo(() => {
    if (activeTab === 'configurations') return configurations;
    if (activeTab === 'territories') return territories;
    return sources;
  }, [activeTab]);
  const activeChartType = activeTab === 'configurations' ? 'pie' : 'bar';

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'select_statement_period',
          title: 'Select statement period',
          description:
            'Select the visible read-only reporting period in the client royalty dashboard.',
          inputSchema: {
            type: 'object',
            properties: {
              periodId: {
                type: 'string',
                enum: periods.map((period) => period.id),
              },
            },
            required: ['periodId'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute(input: unknown) {
            const parsed = parsePeriodInput(input);
            setSelectedPeriod(parsed.periodId);
            return {
              periodId: parsed.periodId,
              status: 'selected',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

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

                <div className="grid gap-3 md:grid-cols-[220px_170px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Filter className="size-4 text-primary" />
                      Tháng
                    </span>
                    <Select
                      onValueChange={(value) => {
                        if (value) setSelectedPeriod(value);
                      }}
                      value={selectedPeriod}
                    >
                      <SelectTrigger
                        aria-label="Tháng báo cáo"
                        className="h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((period) => (
                          <SelectItem key={period.id} value={period.id}>
                            {period.label}
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
                      Chỉ xem dữ liệu đã publish cho tài khoản được gán client.
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
                      File Excel, mapping dữ liệu và publish statement chỉ nằm
                      trong khu admin riêng. Portal này không có nút ghi dữ
                      liệu.
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
              <Tabs
                className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5"
                onValueChange={(value) =>
                  setActiveTab(
                    value as 'sources' | 'configurations' | 'territories',
                  )
                }
                value={activeTab}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Phân tích doanh thu
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Dữ liệu đã được admin import và publish.
                    </p>
                  </div>
                  <TabsList className="h-9">
                    <TabsTrigger value="sources">Sources</TabsTrigger>
                    <TabsTrigger value="configurations">
                      Configurations
                    </TabsTrigger>
                    <TabsTrigger value="territories">Territories</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent className="mt-5" value={activeTab}>
                  <BreakdownChart
                    chartType={activeChartType}
                    data={activeBreakdown}
                  />
                </TabsContent>
              </Tabs>

              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 size-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">
                      Statement mới nhất
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Các kỳ hiển thị ở đây chỉ là những kỳ đã publish cho
                      client.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {periods.slice(0, 4).map((period) => (
                    <div
                      className="rounded-lg border border-border bg-background px-3 py-3"
                      key={period.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{period.label}</p>
                        <Badge className="rounded-lg" variant="outline">
                          {statusLabel(period.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xl font-semibold">
                        {formatMoney(period.closing)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </section>

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
                    <TableHead>Opening</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Costs</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {period.label}: {period.currency} - {period.clientName}
                      </TableCell>
                      <TableCell>{formatMoney(period.opening)}</TableCell>
                      <TableCell>{formatMoney(period.revenue)}</TableCell>
                      <TableCell>{formatMoney(period.costs)}</TableCell>
                      <TableCell>{formatMoney(period.closing)}</TableCell>
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

function parsePeriodInput(input: unknown) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object.');
  }

  const candidate = input as { periodId?: unknown };
  if (
    typeof candidate.periodId !== 'string' ||
    !periods.some((period) => period.id === candidate.periodId)
  ) {
    throw new Error('Invalid periodId.');
  }

  return {
    periodId: candidate.periodId,
  };
}

function BreakdownChart({
  data,
  chartType,
}: {
  data: BreakdownItem[];
  chartType: 'bar' | 'pie';
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="h-[340px] min-w-0 rounded-lg border border-border bg-background p-3">
        {chartType === 'pie' ? (
          <DonutChart data={data} />
        ) : (
          <BarBreakdown data={data} />
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.name}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{formatMoney(item.value)}</TableCell>
              <TableCell>{item.percentage.toFixed(2)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BarBreakdown({ data }: { data: BreakdownItem[] }) {
  const maxValue = Math.max(...data.map((item) => item.value));

  return (
    <div className="grid h-full grid-cols-[44px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-2 overflow-hidden pb-3">
        {data.map((item, index) => (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={item.name}
          >
            <div className="flex h-[270px] w-full items-end border-b border-border">
              <div
                aria-label={`${item.name}: ${formatMoney(item.value)}`}
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
    <div className="flex h-full items-center justify-center">
      <div
        aria-label="Configuration revenue share"
        className="relative size-[230px] rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="absolute inset-[64px] rounded-full border border-border bg-background" />
      </div>
    </div>
  );
}
