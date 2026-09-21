'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BadgePercent,
  CheckCircle2,
  Edit3,
  Music2,
  Power,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';

import {
  TablePagination,
  usePaginatedRows,
} from '@/components/table-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildCalendarQuarterOptions } from '@/lib/reporting-periods';

type RoyaltyRuleStatus = 'active' | 'inactive';

type RoyaltyRule = {
  clientCode: string;
  clientId: string;
  clientName: string;
  effectiveFromPeriod: string;
  effectiveToPeriod: string | null;
  id: string;
  notes: string | null;
  royaltyRateBps: number;
  status: RoyaltyRuleStatus;
  trackExternalId: string;
  trackTitle: string;
  updatedAt: string;
};

type RoyaltyRuleClient = {
  code: string;
  id: string;
  name: string;
  status: 'active' | 'locked' | 'archived';
};

type FormState = {
  clientId: string;
  effectiveFromPeriod: string;
  effectiveToPeriod: string;
  id: string;
  royaltyRate: string;
  status: RoyaltyRuleStatus;
  trackExternalId: string;
  trackTitle: string;
};

const initialForm = (clientId: string, period: string): FormState => ({
  clientId,
  effectiveFromPeriod: period,
  effectiveToPeriod: '',
  id: '',
  royaltyRate: '',
  status: 'active',
  trackExternalId: '',
  trackTitle: '',
});

export function RoyaltyRulesPanel({
  customers,
}: {
  customers: RoyaltyRuleClient[];
}) {
  const quarterOptions = useMemo(() => buildCalendarQuarterOptions(28), []);
  const currentPeriod = quarterOptions[0]?.value ?? '';
  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.status !== 'archived'),
    [customers],
  );
  const [rules, setRules] = useState<RoyaltyRule[]>([]);
  const [form, setForm] = useState<FormState>(() =>
    initialForm(activeCustomers[0]?.id ?? '', currentPeriod),
  );
  const [state, setState] = useState<
    'loading' | 'ready' | 'saving' | 'saved' | 'failed'
  >('loading');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RoyaltyRuleStatus>(
    'all',
  );
  const [activeActionId, setActiveActionId] = useState('');
  const selectedFormClientId = form.clientId || activeCustomers[0]?.id || '';

  const visibleRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rules.filter((rule) => {
      const statusMatches =
        statusFilter === 'all' || rule.status === statusFilter;
      const searchMatches =
        !query ||
        [
          rule.clientCode,
          rule.clientName,
          rule.trackExternalId,
          rule.trackTitle,
        ].some((value) => value.toLowerCase().includes(query));
      return statusMatches && searchMatches;
    });
  }, [rules, search, statusFilter]);
  const rulePage = usePaginatedRows(visibleRules);

  const loadRules = useCallback(async () => {
    setState('loading');
    setMessage('');
    try {
      setRules(await requestRoyaltyRules());
      setState('ready');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không thể tải danh sách tỷ lệ chia.',
      );
      setState('failed');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestRoyaltyRules()
      .then((nextRules) => {
        if (!active) return;
        setRules(nextRules);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Không thể tải danh sách tỷ lệ chia.',
        );
        setState('failed');
      });

    return () => {
      active = false;
    };
  }, []);

  async function saveRule(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (state === 'saving') return;

    setState('saving');
    setMessage('');
    try {
      const response = await fetch('/api/admin/royalty-rules', {
        body: JSON.stringify({
          clientId: selectedFormClientId,
          effectiveFromPeriod: form.effectiveFromPeriod,
          effectiveToPeriod: form.effectiveToPeriod || null,
          royaltyRate: form.royaltyRate,
          ruleId: form.id || undefined,
          status: form.status,
          trackExternalId: form.trackExternalId,
          trackTitle: form.trackTitle,
        }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: form.id ? 'PATCH' : 'POST',
      });
      const result = await readJsonResponse<{
        message?: string;
        rules?: RoyaltyRule[];
      }>(response);
      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể lưu tỷ lệ chia (${response.status}).`,
        );
      }
      setRules(result.rules ?? []);
      setForm(initialForm(form.clientId, currentPeriod));
      setMessage(result.message ?? 'Đã lưu tỷ lệ chia.');
      setState('saved');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không thể lưu tỷ lệ chia lúc này.',
      );
      setState('failed');
    }
  }

  async function toggleRule(rule: RoyaltyRule) {
    if (activeActionId) return;
    setActiveActionId(rule.id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/royalty-rules', {
        body: JSON.stringify({
          clientId: rule.clientId,
          effectiveFromPeriod: rule.effectiveFromPeriod,
          effectiveToPeriod: rule.effectiveToPeriod,
          royaltyRate: rule.royaltyRateBps / 100,
          ruleId: rule.id,
          status: rule.status === 'active' ? 'inactive' : 'active',
          trackExternalId: rule.trackExternalId,
          trackTitle: rule.trackTitle,
        }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        message?: string;
        rules?: RoyaltyRule[];
      }>(response);
      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể cập nhật tỷ lệ (${response.status}).`,
        );
      }
      setRules(result.rules ?? []);
      setMessage(result.message ?? 'Đã cập nhật tỷ lệ chia.');
      setState('saved');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không thể cập nhật tỷ lệ chia.',
      );
      setState('failed');
    } finally {
      setActiveActionId('');
    }
  }

  function editRule(rule: RoyaltyRule) {
    setForm({
      clientId: rule.clientId,
      effectiveFromPeriod: rule.effectiveFromPeriod,
      effectiveToPeriod: rule.effectiveToPeriod ?? '',
      id: rule.id,
      royaltyRate: String(rule.royaltyRateBps / 100),
      status: rule.status,
      trackExternalId: rule.trackExternalId,
      trackTitle: rule.trackTitle,
    });
    setMessage('');
    document.getElementById('royalty-rule-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
      <section className="music-card p-4 md:p-5" id="royalty-rule-form">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Tỷ lệ theo bài hát
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {form.id ? 'Sửa tỷ lệ chia' : 'Thiết lập tỷ lệ chia'}
            </h2>
          </div>
          <BadgePercent className="size-6 text-primary" />
        </div>

        <form className="mt-5 space-y-3" onSubmit={saveRule}>
          <Field label="Khách hàng">
            <Select
              disabled={activeCustomers.length === 0}
              onValueChange={(value) => {
                if (value)
                  setForm((current) => ({ ...current, clientId: value }));
              }}
              value={selectedFormClientId}
            >
              <SelectTrigger
                aria-label="Khách hàng áp dụng"
                className="music-control h-10 w-full"
              >
                <span className="flex-1 truncate text-left">
                  {activeCustomers.find(
                    (customer) => customer.id === selectedFormClientId,
                  )?.name ?? 'Chọn khách hàng'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {activeCustomers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} ({customer.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tên bài hát">
            <Input
              autoComplete="off"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  trackTitle: event.target.value,
                }))
              }
              placeholder="Tên bài hát"
              required
              value={form.trackTitle}
            />
          </Field>

          <Field label="ISRC / ID bài hát">
            <Input
              autoComplete="off"
              className="uppercase"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  trackExternalId: event.target.value,
                }))
              }
              placeholder="Ví dụ: VNABC2600001"
              required
              value={form.trackExternalId}
            />
          </Field>

          <Field label="Tỷ lệ khách hàng nhận (%)">
            <div className="relative">
              <Input
                inputMode="decimal"
                max="100"
                min="0"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    royaltyRate: event.target.value,
                  }))
                }
                placeholder="Ví dụ: 70"
                required
                step="0.01"
                type="number"
                value={form.royaltyRate}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Áp dụng từ quý">
              <QuarterSelect
                label="Quý bắt đầu"
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    effectiveFromPeriod: value,
                  }))
                }
                options={quarterOptions}
                value={form.effectiveFromPeriod}
              />
            </Field>
            <Field label="Đến quý">
              <Select
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    effectiveToPeriod: value && value !== 'open' ? value : '',
                  }))
                }
                value={form.effectiveToPeriod || 'open'}
              >
                <SelectTrigger
                  aria-label="Quý kết thúc"
                  className="music-control h-10 w-full"
                >
                  <span className="flex-1 truncate text-left">
                    {form.effectiveToPeriod || 'Không giới hạn'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Không giới hạn</SelectItem>
                  {quarterOptions.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {message ? (
            <p
              className={`rounded-lg border px-3 py-2 text-sm ${
                state === 'failed'
                  ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                  : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
              }`}
            >
              {message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={state === 'saving' || activeCustomers.length === 0}
              type="submit"
            >
              {state === 'saving' ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : form.id ? (
                <Save className="size-4" />
              ) : (
                <BadgePercent className="size-4" />
              )}
              {form.id ? 'Lưu thay đổi' : 'Tạo tỷ lệ'}
            </Button>
            {form.id ? (
              <Button
                aria-label="Huỷ chỉnh sửa"
                onClick={() =>
                  setForm(initialForm(form.clientId, currentPeriod))
                }
                size="icon"
                title="Huỷ chỉnh sửa"
                type="button"
                variant="outline"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="music-card min-w-0 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Danh mục tỷ lệ
            </p>
            <h2 className="mt-1 text-lg font-semibold">Bài hát đã thiết lập</h2>
          </div>
          <Button
            aria-label="Tải lại danh sách tỷ lệ"
            disabled={state === 'loading'}
            onClick={() => void loadRules()}
            size="icon"
            title="Tải lại"
            variant="ghost"
          >
            <RefreshCw
              className={`size-4 ${state === 'loading' ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Tìm tỷ lệ chia"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm khách hàng, bài hát, ISRC..."
              value={search}
            />
          </div>
          <Select
            onValueChange={(value) => {
              if (
                value === 'all' ||
                value === 'active' ||
                value === 'inactive'
              ) {
                setStatusFilter(value);
              }
            }}
            value={statusFilter}
          >
            <SelectTrigger
              aria-label="Lọc trạng thái tỷ lệ"
              className="music-control h-10 w-full"
            >
              <span className="flex-1 truncate text-left">
                {statusFilter === 'all'
                  ? 'Tất cả trạng thái'
                  : statusFilter === 'active'
                    ? 'Đang áp dụng'
                    : 'Đã tạm dừng'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="active">Đang áp dụng</SelectItem>
              <SelectItem value="inactive">Đã tạm dừng</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Bài hát</TableHead>
                  <TableHead>Tỷ lệ</TableHead>
                  <TableHead>Hiệu lực</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulePage.visibleRows.length > 0 ? (
                  rulePage.visibleRows.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <span className="block font-medium">
                          {rule.clientName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {rule.clientCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <Music2 className="size-4 text-primary" />
                          {rule.trackTitle}
                        </span>
                        <span className="mt-1 block font-mono text-xs text-muted-foreground">
                          {rule.trackExternalId}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-base font-semibold tabular-nums">
                        {formatRate(rule.royaltyRateBps)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {rule.effectiveFromPeriod}
                        <span className="px-1 text-muted-foreground">→</span>
                        {rule.effectiveToPeriod ?? 'Không giới hạn'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            rule.status === 'active'
                              ? 'rounded-md bg-[#e7fbf7] text-[#00796f]'
                              : 'rounded-md bg-muted text-muted-foreground'
                          }
                          variant="secondary"
                        >
                          {rule.status === 'active' ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : null}
                          {rule.status === 'active'
                            ? 'Đang áp dụng'
                            : 'Tạm dừng'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            aria-label={`Sửa tỷ lệ ${rule.trackTitle}`}
                            onClick={() => editRule(rule)}
                            size="icon"
                            title="Sửa"
                            variant="ghost"
                          >
                            <Edit3 className="size-4" />
                          </Button>
                          <Button
                            aria-label={`${rule.status === 'active' ? 'Tạm dừng' : 'Kích hoạt'} tỷ lệ ${rule.trackTitle}`}
                            disabled={activeActionId === rule.id}
                            onClick={() => void toggleRule(rule)}
                            size="icon"
                            title={
                              rule.status === 'active'
                                ? 'Tạm dừng'
                                : 'Kích hoạt'
                            }
                            variant="ghost"
                          >
                            {activeActionId === rule.id ? (
                              <RefreshCw className="size-4 animate-spin" />
                            ) : (
                              <Power className="size-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-28 text-center text-sm text-muted-foreground"
                      colSpan={6}
                    >
                      {state === 'loading'
                        ? 'Đang tải tỷ lệ chia...'
                        : rules.length > 0
                          ? 'Không có tỷ lệ khớp bộ lọc.'
                          : 'Chưa có bài hát nào được thiết lập tỷ lệ riêng.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination {...rulePage} itemLabel="tỷ lệ" />
        </div>
      </section>
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function QuarterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <Select
      onValueChange={(nextValue) => nextValue && onChange(nextValue)}
      value={value}
    >
      <SelectTrigger aria-label={label} className="music-control h-10 w-full">
        <span className="flex-1 truncate text-left">{value}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((period) => (
          <SelectItem key={period.value} value={period.value}>
            {period.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

async function readJsonResponse<T extends { message?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {
      message: response.ok
        ? undefined
        : `Server không trả dữ liệu phản hồi (${response.status}).`,
    } as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      message: `Server trả phản hồi không đúng định dạng (${response.status}).`,
    } as T;
  }
}

async function requestRoyaltyRules() {
  const response = await fetch('/api/admin/royalty-rules', {
    credentials: 'same-origin',
  });
  const result = await readJsonResponse<{
    message?: string;
    rules?: RoyaltyRule[];
  }>(response);
  if (!response.ok) {
    throw new Error(
      result.message ?? `Không thể tải tỷ lệ chia (${response.status}).`,
    );
  }
  return result.rules ?? [];
}

function formatRate(bps: number) {
  return `${new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2,
  }).format(bps / 100)}%`;
}
