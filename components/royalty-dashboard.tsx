'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  uploadChecks,
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

function validateWorkbook(file: File | null) {
  if (!file) {
    return {
      state: 'idle',
      message: 'Chọn file Excel statement để kiểm tra trước khi import.',
      progress: 18,
    };
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xlsm') || lowerName.endsWith('.xls')) {
    return {
      state: 'blocked',
      message:
        'File bị chặn: chỉ nhận .xlsx, không nhận macro hoặc định dạng cũ.',
      progress: 42,
    };
  }

  if (!lowerName.endsWith('.xlsx')) {
    return {
      state: 'blocked',
      message: 'Sai định dạng. Admin cần tải lên template .xlsx đã chuẩn hóa.',
      progress: 36,
    };
  }

  if (file.size > 15 * 1024 * 1024) {
    return {
      state: 'blocked',
      message:
        'File vượt quá giới hạn 15MB của MVP. Cần chia nhỏ hoặc tăng quota có kiểm soát.',
      progress: 58,
    };
  }

  return {
    state: 'ready',
    message: `${file.name} đã qua kiểm tra client-side. Backend vẫn phải xác minh lại trước khi lưu.`,
    progress: 86,
  };
}

export function RoyaltyDashboard({ userEmail }: { userEmail: string }) {
  const [selectedClient, setSelectedClient] = useState(clients[0].id);
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0].id);
  const [activeTab, setActiveTab] = useState<
    'sources' | 'configurations' | 'territories'
  >('sources');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<
    'idle' | 'uploading' | 'stored' | 'failed'
  >('idle');
  const [uploadMessage, setUploadMessage] = useState(
    'Backend sẽ xác minh lại file trước khi lưu riêng tư.',
  );

  const activeClient =
    clients.find((client) => client.id === selectedClient) ?? clients[0];
  const activePeriod =
    periods.find((period) => period.id === selectedPeriod) ?? periods[0];
  const activeBreakdown =
    activeTab === 'configurations'
      ? configurations
      : activeTab === 'territories'
        ? territories
        : sources;
  const activeChartType = activeTab === 'configurations' ? 'pie' : 'bar';
  const validation = useMemo(
    () => validateWorkbook(selectedFile),
    [selectedFile],
  );

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'select_report_scope',
          title: 'Select report scope',
          description:
            'Select the visible client and reporting period in the royalty dashboard.',
          inputSchema: {
            type: 'object',
            properties: {
              clientId: {
                type: 'string',
                enum: clients.map((client) => client.id),
              },
              periodId: {
                type: 'string',
                enum: periods.map((period) => period.id),
              },
            },
            required: ['clientId', 'periodId'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          execute(input: unknown) {
            const parsed = parseReportScope(input);
            setSelectedClient(parsed.clientId);
            setSelectedPeriod(parsed.periodId);
            return {
              clientId: parsed.clientId,
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

  async function uploadWorkbook() {
    if (!selectedFile || validation.state !== 'ready') return;

    setUploadState('uploading');
    setUploadMessage(
      'Đang gửi file tới backend để kiểm tra và lưu riêng tư...',
    );

    const body = new FormData();
    body.append('file', selectedFile);
    body.append('clientId', activeClient.id);
    body.append('clientName', activeClient.name);
    body.append('clientCode', activeClient.code);
    body.append('period', activePeriod.id);

    try {
      const response = await fetch('/api/uploads', {
        method: 'POST',
        body,
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? 'Upload bị từ chối.');
      }

      setUploadState('stored');
      setUploadMessage(
        result.message ??
          'File đã được lưu. Import sẽ chỉ chạy sau khi malware scan và parser pass.',
      );
    } catch (error) {
      setUploadState('failed');
      setUploadMessage(
        error instanceof Error
          ? error.message
          : 'Không thể upload file ở thời điểm này.',
      );
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[76px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex flex-col items-center gap-3 border-r border-border bg-sidebar px-3 py-5 max-lg:hidden">
          <div className="mb-5 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          {[
            ['Dashboard', BarChart3],
            ['Clients', Users],
            ['Uploads', FileSpreadsheet],
            ['Security', LockKeyhole],
            ['Audit', Fingerprint],
          ].map(([label, Icon], index) => {
            const ItemIcon = Icon as typeof BarChart3;
            return (
              <Button
                key={String(label)}
                aria-label={String(label)}
                className={
                  index === 0
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : ''
                }
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
                  Royalty Control Center
                </p>
                <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
                  Dashboard khách hàng
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="h-7 rounded-lg bg-primary/10 px-3 text-primary"
                  variant="secondary"
                >
                  <KeyRound className="size-3.5" />
                  SIWC protected
                </Badge>
                <Badge
                  className="h-7 rounded-lg bg-[#eef6ef] px-3 text-[#2f6f45]"
                  variant="secondary"
                >
                  {userEmail}
                </Badge>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-5 md:px-8 md:py-7">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Bộ lọc báo cáo</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mỗi truy vấn được khóa theo user, client và kỳ báo cáo ở
                      backend.
                    </p>
                  </div>
                  <Button variant="outline">
                    <Download className="size-4" />
                    Download statement
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_170px]">
                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Users className="size-4 text-primary" />
                      Khách hàng
                    </span>
                    <Select
                      value={selectedClient}
                      onValueChange={(value) => {
                        if (value) setSelectedClient(value);
                      }}
                    >
                      <SelectTrigger
                        aria-label="Khách hàng"
                        className="h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Filter className="size-4 text-primary" />
                      Tháng
                    </span>
                    <Select
                      value={selectedPeriod}
                      onValueChange={(value) => {
                        if (value) setSelectedPeriod(value);
                      }}
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
                </div>
              </div>

              <div className="rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-4 shadow-sm md:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
                    <LockKeyhole className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#3a2a0a]">
                      Security-first
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[#6f5318]">
                      Client không gửi `client_id` đáng tin cậy. Server lấy
                      quyền từ session, kiểm tra role và ghi audit log trước khi
                      đọc hoặc import dữ liệu.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {metrics.map((metric) => (
                <article
                  key={metric.label}
                  className={`min-h-[132px] rounded-lg p-4 shadow-sm ${toneClass[metric.tone]}`}
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
                      {activePeriod.label}: {activePeriod.currency} -{' '}
                      {activeClient.name}
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
                    data={activeBreakdown}
                    chartType={activeChartType}
                  />
                </TabsContent>
              </Tabs>

              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Upload Excel</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Import theo khách hàng và tháng đang chọn.
                    </p>
                  </div>
                  <FileSpreadsheet className="size-6 text-primary" />
                </div>

                <label className="mt-5 flex min-h-[142px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#79aeb8] bg-[#f2fafb] px-4 py-6 text-center">
                  <Upload className="size-7 text-primary" />
                  <span className="mt-3 text-sm font-semibold text-[#24434a]">
                    Chọn file statement .xlsx
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    Tối đa 15MB, không macro
                  </span>
                  <input
                    accept=".xlsx"
                    className="sr-only"
                    type="file"
                    onChange={(event) => {
                      setSelectedFile(event.target.files?.[0] ?? null);
                      setUploadState('idle');
                      setUploadMessage(
                        'Backend sẽ xác minh lại file trước khi lưu riêng tư.',
                      );
                    }}
                  />
                </label>

                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Validation gate</span>
                    <Badge
                      className={
                        validation.state === 'blocked'
                          ? 'rounded-lg bg-[#ffe9e7] text-[#a53a30]'
                          : 'rounded-lg bg-[#e9f7f2] text-[#22735f]'
                      }
                      variant="secondary"
                    >
                      {validation.state === 'blocked' ? 'Blocked' : 'Ready'}
                    </Badge>
                  </div>
                  <Progress value={validation.progress} />
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {validation.message}
                  </p>
                </div>

                <Button
                  className="mt-4 h-10 w-full"
                  disabled={
                    validation.state !== 'ready' || uploadState === 'uploading'
                  }
                  onClick={uploadWorkbook}
                >
                  <Upload className="size-4" />
                  {uploadState === 'uploading'
                    ? 'Đang kiểm tra...'
                    : 'Lưu file riêng tư'}
                </Button>
                <p
                  className={`mt-3 text-sm leading-6 ${
                    uploadState === 'failed'
                      ? 'text-[#a53a30]'
                      : uploadState === 'stored'
                        ? 'text-[#22735f]'
                        : 'text-muted-foreground'
                  }`}
                >
                  {uploadMessage}
                </p>
              </section>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Latest statements</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Danh sách kỳ báo cáo đã nạp vào hệ thống.
                    </p>
                  </div>
                  <Database className="size-5 text-primary" />
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
                          {period.label}: {period.currency} -{' '}
                          {period.clientName}
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

              <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 text-[#c9851f]" />
                  <div>
                    <h2 className="text-lg font-semibold">Import controls</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Những rule này phải chạy lại ở backend dù client-side đã
                      báo pass.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {uploadChecks.map((check) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-border bg-background px-3 py-2"
                      key={check.label}
                    >
                      <div>
                        <p className="text-sm font-medium">{check.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {check.value}
                        </p>
                      </div>
                      <Badge
                        className="self-center rounded-lg bg-primary/10 text-primary"
                        variant="secondary"
                      >
                        {check.state}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function parseReportScope(input: unknown) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object.');
  }

  const candidate = input as { clientId?: unknown; periodId?: unknown };
  if (
    typeof candidate.clientId !== 'string' ||
    !clients.some((client) => client.id === candidate.clientId)
  ) {
    throw new Error('Invalid clientId.');
  }

  if (
    typeof candidate.periodId !== 'string' ||
    !periods.some((period) => period.id === candidate.periodId)
  ) {
    throw new Error('Invalid periodId.');
  }

  return {
    clientId: candidate.clientId,
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
