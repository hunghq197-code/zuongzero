'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FolderLock,
  ListChecks,
  LockKeyhole,
  RefreshCcw,
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
import {
  clients,
  periods,
  uploadChecks,
  type CurrencyCode,
  type StatementPeriod,
} from '@/lib/dashboard-data';

const adminMonths = Array.from(new Set(periods.map((period) => period.period)));

function formatMoney(value: number, currency: CurrencyCode = 'USD') {
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

function periodLabel(period: StatementPeriod) {
  return `${period.label}: ${period.currency} - ${period.clientName}`;
}

function validateWorkbook(file: File | null) {
  if (!file) {
    return {
      state: 'idle',
      message: 'Chọn file Excel statement để kiểm tra trước khi lưu.',
      progress: 18,
    };
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xlsm') || lowerName.endsWith('.xls')) {
    return {
      state: 'blocked',
      message:
        'File bị chặn: chỉ nhận .xlsx, không nhận macro hoặc định dạng Excel cũ.',
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
    message: `${file.name} đã qua kiểm tra ban đầu. Backend vẫn xác minh lại trước khi lưu.`,
    progress: 86,
  };
}

export function AdminConsole({
  accessMode,
  userEmail,
}: {
  accessMode: 'configured' | 'local-preview';
  userEmail: string;
}) {
  const [selectedClient, setSelectedClient] = useState(clients[0].id);
  const [selectedMonth, setSelectedMonth] = useState(adminMonths[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<
    'idle' | 'uploading' | 'stored' | 'failed'
  >('idle');
  const [uploadMessage, setUploadMessage] = useState(
    'File chỉ được publish lên dashboard khách hàng sau khi parser và validation pass.',
  );

  const activeClient =
    clients.find((client) => client.id === selectedClient) ?? clients[0];
  const validation = useMemo(
    () => validateWorkbook(selectedFile),
    [selectedFile],
  );

  async function uploadWorkbook() {
    if (!selectedFile || validation.state !== 'ready') return;

    setUploadState('uploading');
    setUploadMessage('Đang gửi file tới API admin-only...');

    const body = new FormData();
    body.append('file', selectedFile);
    body.append('clientId', activeClient.id);
    body.append('period', selectedMonth);

    try {
      const response = await fetch('/api/admin/uploads', {
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
          'File đã lưu riêng tư. Chưa publish cho khách hàng cho tới khi import pass.',
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
      <header className="border-b border-border bg-card px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Admin Console
            </p>
            <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
              Quản lý khách hàng và upload dữ liệu
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="h-7 rounded-lg bg-primary/10 px-3 text-primary"
              variant="secondary"
            >
              <ShieldCheck className="size-3.5" />
              Admin-only
            </Badge>
            <Badge className="h-7 rounded-lg" variant="outline">
              {userEmail}
            </Badge>
            <button
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              onClick={() => {
                window.location.assign('/');
              }}
              type="button"
            >
              Client portal
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5 md:px-8 md:py-7">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Khách hàng</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin chọn client, tháng và upload dữ liệu thay cho khách
                  hàng.
                </p>
              </div>
              <Users className="size-5 text-primary" />
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Viewer email</TableHead>
                    <TableHead>Latest</TableHead>
                    <TableHead>Months</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        <span className="block">{client.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {client.code}
                        </span>
                      </TableCell>
                      <TableCell>{client.viewerEmail}</TableCell>
                      <TableCell>{client.latestPeriod}</TableCell>
                      <TableCell>{client.uploadedMonths}</TableCell>
                      <TableCell>
                        <span className="block">
                          {formatMoney(client.totalRevenue, 'USD')}
                        </span>
                        {'secondaryRevenue' in client ? (
                          <span className="text-xs text-muted-foreground">
                            {formatMoney(client.secondaryRevenue, 'VND')}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge className="rounded-lg" variant="outline">
                          {client.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-4 shadow-sm md:p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
                <LockKeyhole className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#3a2a0a]">
                  Tách quyền tuyệt đối
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#6f5318]">
                  Khách hàng chỉ thấy dashboard read-only. Upload, replace,
                  mapping và publish chỉ xuất hiện ở route admin và API
                  admin-only.
                </p>
                <p className="mt-3 text-xs font-medium uppercase text-[#7c5d18]">
                  Access mode: {accessMode}
                </p>
              </div>
            </div>
          </section>
        </section>

        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Upload dữ liệu tháng</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  File gốc lưu riêng tư, dashboard chỉ nhận aggregate đã
                  publish.
                </p>
              </div>
              <FileSpreadsheet className="size-6 text-primary" />
            </div>

            <div className="mt-5 grid gap-3">
              <div className="space-y-2">
                <span className="block text-sm font-medium">Khách hàng</span>
                <Select
                  onValueChange={(value) => {
                    if (value) setSelectedClient(value);
                  }}
                  value={selectedClient}
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
                <span className="block text-sm font-medium">Tháng dữ liệu</span>
                <Select
                  onValueChange={(value) => {
                    if (value) setSelectedMonth(value);
                  }}
                  value={selectedMonth}
                >
                  <SelectTrigger
                    aria-label="Tháng dữ liệu"
                    className="h-10 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {adminMonths.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    'File chỉ được publish lên dashboard khách hàng sau khi parser và validation pass.',
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
              <FolderLock className="size-4" />
              {uploadState === 'uploading'
                ? 'Đang kiểm tra...'
                : 'Lưu vào kho riêng tư'}
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

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Pipeline import</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dữ liệu chỉ đi tới client portal sau bước publish.
                </p>
              </div>
              <RefreshCcw className="size-5 text-primary" />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                [
                  '1',
                  'Upload private',
                  'Lưu file gốc vào R2 theo client/tháng.',
                ],
                [
                  '2',
                  'Validate & parse',
                  'Kiểm tra template, sheet, cột và checksum.',
                ],
                [
                  '3',
                  'Publish read-only',
                  'Ghi statement đã khóa vào dashboard khách.',
                ],
              ].map(([step, title, body]) => (
                <div
                  className="rounded-lg border border-border bg-background p-4"
                  key={step}
                >
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {step}
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="size-5 text-primary" />
                  <h3 className="font-semibold">Latest statements</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Closing</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periods.slice(0, 4).map((period) => (
                      <TableRow key={period.id}>
                        <TableCell className="font-medium">
                          {periodLabel(period)}
                        </TableCell>
                        <TableCell>
                          {formatMoney(period.revenue, period.currency)}
                        </TableCell>
                        <TableCell>
                          {formatMoney(period.closing, period.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge className="rounded-lg" variant="outline">
                            {period.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 text-[#c9851f]" />
                  <div>
                    <h3 className="font-semibold">Upload controls</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Những rule này chạy lại ở backend. File .xls mẫu chỉ dùng
                      để phân tích bố cục, không mở upload production.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {uploadChecks.map((check) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-border bg-card px-3 py-2"
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
              </div>
            </div>
          </section>
        </section>

        <section className="rounded-lg border border-[#b7d8c2] bg-[#f1faf3] p-4 shadow-sm md:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-[#2f6f45]" />
            <p className="text-sm leading-6 text-[#326247]">
              Khách hàng không thể upload từ dashboard. Nếu họ gọi thẳng API
              admin, backend vẫn kiểm tra session và allowlist admin trước khi
              ghi R2/D1.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
