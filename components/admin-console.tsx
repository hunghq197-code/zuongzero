'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  Copy,
  Disc3,
  Edit3,
  EyeOff,
  FileSpreadsheet,
  FolderLock,
  LockKeyhole,
  LogOut,
  Mail,
  Mic2,
  Music2,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  BrandMark,
  ConsoleRail,
  EqualizerBars,
} from '@/components/music-brand';
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
import { clients, type CurrencyCode } from '@/lib/dashboard-data';
import { buildCalendarMonthOptions } from '@/lib/calendar-months';
import { type AdminActivityRow } from '@/lib/admin-activity';
import {
  fallbackAdminOverviewData,
  fallbackAdminStatements,
  type AdminOverviewData,
  type AdminStatementRow,
  type AdminTrendItem,
} from '@/lib/admin-dashboard';

type AdminRole = 'super_admin' | 'admin';
type ManagedAccountRole = 'admin' | 'client';
type ClientAccessLevel = 'owner' | 'viewer' | 'finance';

type ManagedAccountRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: 'super_admin' | 'admin' | 'client' | 'auditor' | 'pending';
  status: 'active' | 'disabled';
  createdAt: string;
  lastSeenAt: string | null;
  clientId: string | null;
  clientName: string | null;
  accessLevel: ClientAccessLevel | null;
};

type ManagedCustomerRow = {
  id: string;
  code: string;
  name: string;
  viewerEmail: string | null;
  latestPeriod: string | null;
  uploadedMonths: number;
  totalRevenue: number;
  totalRevenueVnd: number;
  status: CustomerStatus;
};

type CustomerStatus = 'active' | 'locked' | 'archived';
type CustomerActionState = 'idle' | 'saving' | 'saved' | 'failed';
type StatementAction = 'publish' | 'unpublish' | 'lock';
type CustomerStatusFilter = 'all' | CustomerStatus;
type StatementStatusFilter = 'all' | AdminStatementRow['status'];

const adminPalette = [
  '#00b8a9',
  '#ff4d6d',
  '#7c3aed',
  '#f59e0b',
  '#2563eb',
  '#111827',
];

const fallbackCustomers: ManagedCustomerRow[] = clients.map((client) => ({
  code: client.code,
  id: client.id,
  latestPeriod: client.latestPeriod,
  name: client.name,
  status: client.status as CustomerStatus,
  totalRevenue: client.totalRevenue,
  totalRevenueVnd: client.secondaryRevenue,
  uploadedMonths: client.uploadedMonths,
  viewerEmail: client.viewerEmail,
}));

function formatMoney(value: number, currency: CurrencyCode = 'USD') {
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function accountRoleLabel(role: ManagedAccountRow['role']) {
  const labels: Record<ManagedAccountRow['role'], string> = {
    admin: 'Quản lý',
    auditor: 'Auditor',
    client: 'Khách hàng',
    pending: 'Pending',
    super_admin: 'Super admin',
  };

  return labels[role];
}

function accountRoleClass(role: ManagedAccountRow['role']) {
  if (role === 'super_admin') {
    return 'rounded-lg bg-primary/10 text-primary';
  }
  if (role === 'admin') return 'rounded-lg bg-[#e9f7f2] text-[#22735f]';
  if (role === 'client') return 'rounded-lg bg-[#eef4ff] text-[#2f5da8]';

  return 'rounded-lg';
}

function accountStatusLabel(account: ManagedAccountRow) {
  if (account.status === 'disabled' && !account.lastSeenAt) {
    return 'Chờ kích hoạt';
  }

  if (account.status === 'active') return 'Active';
  return 'Disabled';
}

function accessLevelLabel(accessLevel: ClientAccessLevel | null) {
  const labels: Record<ClientAccessLevel, string> = {
    finance: 'Finance',
    owner: 'Owner',
    viewer: 'Viewer',
  };

  return accessLevel ? labels[accessLevel] : 'Không gán client';
}

function formatAccountDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function customerStatusLabel(status: string) {
  if (status === 'active') return 'Active';
  if (status === 'locked') return 'Locked';
  if (status === 'archived') return 'Archived';

  return status || 'Active';
}

function customerStatusFilterLabel(status: CustomerStatusFilter) {
  if (status === 'all') return 'Tất cả trạng thái';
  return customerStatusLabel(status);
}

function statementStatusLabel(status: AdminStatementRow['status']) {
  if (status === 'published') return 'Published';
  if (status === 'locked') return 'Locked';
  if (status === 'replaced') return 'Hidden';
  if (status === 'validating') return 'Validating';
  return 'Draft';
}

function statementStatusFilterLabel(status: StatementStatusFilter) {
  if (status === 'all') return 'Tất cả status';
  return statementStatusLabel(status);
}

function trendLabel(trend: AdminTrendItem['trend']) {
  if (trend === 'new') return 'New';
  if (trend === 'up') return 'Up';
  if (trend === 'down') return 'Down';
  return 'Flat';
}

function trendClass(trend: AdminTrendItem['trend']) {
  if (trend === 'up' || trend === 'new') {
    return 'bg-[#e7fbf7] text-[#00796f]';
  }

  if (trend === 'down') return 'bg-[#fff2f0] text-[#a53a30]';
  return 'bg-muted text-muted-foreground';
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
      message: response.ok
        ? 'Server trả phản hồi không đúng định dạng.'
        : `Server trả phản hồi không đúng định dạng (${response.status}).`,
    } as T;
  }
}

function fetchWithSession(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
  });
}

function rowMatchesSearch(query: string, values: Array<string | null>) {
  if (!query) return true;

  return values.some((value) => value?.toLowerCase().includes(query));
}

function validateWorkbook(file: File | null) {
  if (!file) {
    return {
      state: 'idle',
      message: 'Chưa chọn file.',
      progress: 18,
    };
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xlsm') || lowerName.endsWith('.xls')) {
    return {
      state: 'blocked',
      message: 'Chỉ nhận file .xlsx.',
      progress: 42,
    };
  }

  if (!lowerName.endsWith('.xlsx')) {
    return {
      state: 'blocked',
      message: 'Sai định dạng file.',
      progress: 36,
    };
  }

  if (file.size > 15 * 1024 * 1024) {
    return {
      state: 'blocked',
      message: 'File vượt quá 15MB.',
      progress: 58,
    };
  }

  return {
    state: 'ready',
    message: 'File hợp lệ.',
    progress: 86,
  };
}

export function AdminConsole({
  adminRole,
  userEmail,
}: {
  adminRole: AdminRole;
  userEmail: string;
}) {
  const isSuperAdmin = adminRole === 'super_admin';
  const adminMonthOptions = useMemo(() => buildCalendarMonthOptions(), []);
  const initialMonth = adminMonthOptions[0]?.value ?? '';
  const [customers, setCustomers] =
    useState<ManagedCustomerRow[]>(fallbackCustomers);
  const [selectedClient, setSelectedClient] = useState(
    fallbackCustomers[0]?.id ?? '',
  );
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [overview, setOverview] = useState<AdminOverviewData>(() =>
    fallbackAdminOverviewData(initialMonth),
  );
  const [statementRows, setStatementRows] = useState<AdminStatementRow[]>(
    fallbackAdminStatements(),
  );
  const [activityRows, setActivityRows] = useState<AdminActivityRow[]>([]);
  const [operationsState, setOperationsState] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [operationsMessage, setOperationsMessage] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState('');
  const [editingCustomerName, setEditingCustomerName] = useState('');
  const [editingCustomerCode, setEditingCustomerCode] = useState('');
  const [editingCustomerStatus, setEditingCustomerStatus] =
    useState<CustomerStatus>('active');
  const [customerActionState, setCustomerActionState] =
    useState<CustomerActionState>('idle');
  const [customerActionMessage, setCustomerActionMessage] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] =
    useState<CustomerStatusFilter>('all');
  const [activeCustomerActionId, setActiveCustomerActionId] = useState('');
  const [activeStatementActionId, setActiveStatementActionId] = useState('');
  const [statementSearch, setStatementSearch] = useState('');
  const [statementStatusFilter, setStatementStatusFilter] =
    useState<StatementStatusFilter>('all');
  const [customerDeleteTarget, setCustomerDeleteTarget] =
    useState<ManagedCustomerRow | null>(null);
  const [statementDeleteTarget, setStatementDeleteTarget] =
    useState<AdminStatementRow | null>(null);
  const [statementActionMessage, setStatementActionMessage] = useState('');
  const [statementActionState, setStatementActionState] = useState<
    'idle' | 'saved' | 'failed'
  >('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<
    'idle' | 'uploading' | 'stored' | 'failed'
  >('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [managedAccounts, setManagedAccounts] = useState<ManagedAccountRow[]>(
    [],
  );
  const [accountEmail, setAccountEmail] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [accountClientName, setAccountClientName] = useState('');
  const [accountClientCode, setAccountClientCode] = useState('');
  const [accountRole, setAccountRole] = useState<ManagedAccountRole>('client');
  const [accountAccessLevel, setAccountAccessLevel] =
    useState<ClientAccessLevel>('viewer');
  const [accountState, setAccountState] = useState<
    'idle' | 'loading' | 'saving' | 'saved' | 'failed'
  >(isSuperAdmin ? 'loading' : 'idle');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountInviteUrl, setAccountInviteUrl] = useState('');
  const [inviteCopyMessage, setInviteCopyMessage] = useState('');
  const [resettingAccountId, setResettingAccountId] = useState('');
  const [resetState, setResetState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  );
  const [resetMessage, setResetMessage] = useState('');
  const [resetInviteUrl, setResetInviteUrl] = useState('');
  const [resetCopyMessage, setResetCopyMessage] = useState('');
  const [activeAccountActionId, setActiveAccountActionId] = useState('');

  const activeClient =
    customers.find((client) => client.id === selectedClient) ??
    customers[0] ??
    null;
  const selectedMonthLabel =
    adminMonthOptions.find((month) => month.value === selectedMonth)?.label ??
    selectedMonth;
  const visibleCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    return customers.filter((customer) => {
      const statusMatches =
        customerStatusFilter === 'all' ||
        customer.status === customerStatusFilter;

      return (
        statusMatches &&
        rowMatchesSearch(query, [
          customer.code,
          customer.latestPeriod,
          customer.name,
          customer.viewerEmail,
        ])
      );
    });
  }, [customers, customerSearch, customerStatusFilter]);
  const visibleStatementRows = useMemo(() => {
    const query = statementSearch.trim().toLowerCase();

    return statementRows.filter((statement) => {
      const statusMatches =
        statementStatusFilter === 'all' ||
        statement.status === statementStatusFilter;

      return (
        statusMatches &&
        rowMatchesSearch(query, [
          statement.clientCode,
          statement.clientName,
          statement.currency,
          statement.filename,
          statement.period,
          statement.status,
        ])
      );
    });
  }, [statementRows, statementSearch, statementStatusFilter]);
  const validation = useMemo(
    () => validateWorkbook(selectedFile),
    [selectedFile],
  );
  const activeCustomerCount = overview.summary.activeCustomers;
  const uploadedMonthCount = overview.summary.statementCount;
  const totalUsdRevenue = overview.summary.revenueUsd;

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      try {
        setOperationsState('loading');
        const [
          accountsResponse,
          overviewResponse,
          statementsResponse,
          activityResponse,
        ] = await Promise.all([
          fetchWithSession(
            isSuperAdmin ? '/api/admin/accounts' : '/api/admin/customers',
          ),
          fetchWithSession(
            `/api/admin/overview?period=${encodeURIComponent(selectedMonth)}`,
          ),
          fetchWithSession(
            `/api/admin/statements?period=${encodeURIComponent(selectedMonth)}`,
          ),
          fetchWithSession('/api/admin/activity?limit=12'),
        ]);
        const result = await readJsonResponse<{
          accounts?: ManagedAccountRow[];
          customers?: ManagedCustomerRow[];
          message?: string;
        }>(accountsResponse);
        const overviewResult = await readJsonResponse<{
          overview?: AdminOverviewData;
          message?: string;
        }>(overviewResponse);
        const statementsResult = await readJsonResponse<{
          statements?: AdminStatementRow[];
          message?: string;
        }>(statementsResponse);
        const activityResult = await readJsonResponse<{
          activity?: AdminActivityRow[];
          message?: string;
        }>(activityResponse);

        if (!accountsResponse.ok) {
          throw new Error(result.message ?? 'Không thể tải dữ liệu admin.');
        }
        if (!overviewResponse.ok) {
          throw new Error(
            overviewResult.message ?? 'Không thể tải dashboard tổng.',
          );
        }
        if (!statementsResponse.ok) {
          throw new Error(
            statementsResult.message ?? 'Không thể tải statement.',
          );
        }
        if (!activityResponse.ok) {
          throw new Error(
            activityResult.message ?? 'Không thể tải lịch sử hoạt động.',
          );
        }

        if (!cancelled) {
          if (isSuperAdmin) {
            setManagedAccounts(result.accounts ?? []);
            setAccountMessage('');
            setAccountState('idle');
          }
          const nextCustomers = result.customers ?? fallbackCustomers;
          setCustomers(nextCustomers);
          setSelectedClient((currentClient) =>
            nextCustomers.some((client) => client.id === currentClient)
              ? currentClient
              : (nextCustomers[0]?.id ?? ''),
          );
          setOverview(
            overviewResult.overview ?? fallbackAdminOverviewData(selectedMonth),
          );
          setStatementRows(statementsResult.statements ?? []);
          setActivityRows(activityResult.activity ?? []);
          setOperationsMessage('');
          setOperationsState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          if (isSuperAdmin) {
            setAccountMessage(
              error instanceof Error
                ? error.message
                : 'Không thể tải danh sách tài khoản.',
            );
            setAccountState('failed');
          }
          setOperationsMessage(
            error instanceof Error
              ? error.message
              : 'Không thể tải dashboard admin.',
          );
          setOperationsState('failed');
        }
      }
    }

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, selectedMonth]);

  async function refreshAdminSnapshot(period = selectedMonth) {
    const [
      customersResponse,
      overviewResponse,
      statementsResponse,
      activityResponse,
    ] = await Promise.all([
      fetchWithSession('/api/admin/customers'),
      fetchWithSession(
        `/api/admin/overview?period=${encodeURIComponent(period)}`,
      ),
      fetchWithSession(
        `/api/admin/statements?period=${encodeURIComponent(period)}`,
      ),
      fetchWithSession('/api/admin/activity?limit=12'),
    ]);
    const customersResult = await readJsonResponse<{
      customers?: ManagedCustomerRow[];
      message?: string;
    }>(customersResponse);
    const overviewResult = await readJsonResponse<{
      overview?: AdminOverviewData;
      message?: string;
    }>(overviewResponse);
    const statementsResult = await readJsonResponse<{
      statements?: AdminStatementRow[];
      message?: string;
    }>(statementsResponse);
    const activityResult = await readJsonResponse<{
      activity?: AdminActivityRow[];
      message?: string;
    }>(activityResponse);

    if (!customersResponse.ok) {
      throw new Error(
        customersResult.message ?? 'Không thể tải lại khách hàng.',
      );
    }
    if (!overviewResponse.ok) {
      throw new Error(
        overviewResult.message ?? 'Không thể tải lại dashboard tổng.',
      );
    }
    if (!statementsResponse.ok) {
      throw new Error(
        statementsResult.message ?? 'Không thể tải lại statement.',
      );
    }
    if (!activityResponse.ok) {
      throw new Error(
        activityResult.message ?? 'Không thể tải lại lịch sử hoạt động.',
      );
    }

    const nextCustomers = customersResult.customers ?? fallbackCustomers;
    setCustomers(nextCustomers);
    setSelectedClient((currentClient) =>
      nextCustomers.some((client) => client.id === currentClient)
        ? currentClient
        : (nextCustomers[0]?.id ?? ''),
    );
    setOverview(overviewResult.overview ?? fallbackAdminOverviewData(period));
    setStatementRows(statementsResult.statements ?? []);
    setActivityRows(activityResult.activity ?? []);
  }

  async function createManagedAccount(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!isSuperAdmin || accountState === 'saving') return;

    setAccountState('saving');
    setAccountMessage('');
    setAccountInviteUrl('');
    setInviteCopyMessage('');

    try {
      const response = await fetchWithSession('/api/admin/accounts', {
        body: JSON.stringify({
          accessLevel: accountAccessLevel,
          clientCode: accountRole === 'client' ? accountClientCode : undefined,
          clientName: accountRole === 'client' ? accountClientName : undefined,
          displayName:
            accountRole === 'client' ? accountClientName : accountDisplayName,
          email: accountEmail,
          role: accountRole,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const result = await readJsonResponse<{
        account?: {
          clientId?: string;
          inviteUrl?: string;
        };
        accounts?: ManagedAccountRow[];
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể tạo tài khoản (${response.status}).`,
        );
      }

      setManagedAccounts(result.accounts ?? []);
      setCustomers(result.customers ?? []);
      if (result.account?.clientId) {
        setSelectedClient(result.account.clientId);
      }
      setAccountEmail('');
      setAccountDisplayName('');
      setAccountClientName('');
      setAccountClientCode('');
      setAccountInviteUrl(result.account?.inviteUrl ?? '');
      setAccountMessage(result.message ?? 'Đã tạo tài khoản.');
      setAccountState('saved');
      await refreshAdminSnapshot(selectedMonth);
      if (result.account?.clientId) {
        setSelectedClient(result.account.clientId);
      }
    } catch (error) {
      setAccountMessage(
        error instanceof Error
          ? error.message
          : 'Không thể tạo tài khoản ở thời điểm này.',
      );
      setAccountState('failed');
    }
  }

  async function copyInviteUrl() {
    if (!accountInviteUrl) return;

    try {
      await navigator.clipboard.writeText(accountInviteUrl);
      setInviteCopyMessage('Đã copy link.');
    } catch {
      setInviteCopyMessage('Không thể copy tự động.');
    }
  }

  async function copyResetUrl() {
    if (!resetInviteUrl) return;

    try {
      await navigator.clipboard.writeText(resetInviteUrl);
      setResetCopyMessage('Đã copy link.');
    } catch {
      setResetCopyMessage('Không thể copy tự động.');
    }
  }

  async function sendAccountLink(account: ManagedAccountRow) {
    if (!isSuperAdmin || resettingAccountId || account.role === 'super_admin') {
      return;
    }

    setResettingAccountId(account.id);
    setResetState('idle');
    setResetMessage('');
    setResetInviteUrl('');
    setResetCopyMessage('');

    try {
      const response = await fetchWithSession('/api/admin/accounts', {
        body: JSON.stringify({
          userId: account.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        account?: {
          inviteUrl?: string;
        };
        accounts?: ManagedAccountRow[];
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể tạo link (${response.status}).`,
        );
      }

      setManagedAccounts(result.accounts ?? []);
      setCustomers(result.customers ?? []);
      setResetInviteUrl(result.account?.inviteUrl ?? '');
      setResetMessage(result.message ?? 'Đã tạo link cho tài khoản.');
      setResetState('saved');
    } catch (error) {
      setResetMessage(
        error instanceof Error
          ? error.message
          : 'Không thể tạo link cho tài khoản ở thời điểm này.',
      );
      setResetState('failed');
    } finally {
      setResettingAccountId('');
    }
  }

  async function toggleAccountStatus(account: ManagedAccountRow) {
    if (
      !isSuperAdmin ||
      activeAccountActionId ||
      account.role === 'super_admin'
    ) {
      return;
    }

    const nextStatus = account.status === 'active' ? 'disabled' : 'active';

    setActiveAccountActionId(account.id);
    setResetState('idle');
    setResetMessage('');
    setResetInviteUrl('');
    setResetCopyMessage('');

    try {
      const response = await fetchWithSession('/api/admin/accounts', {
        body: JSON.stringify({
          action: 'set_status',
          status: nextStatus,
          userId: account.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        accounts?: ManagedAccountRow[];
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ??
            `Không thể cập nhật tài khoản (${response.status}).`,
        );
      }

      setManagedAccounts(result.accounts ?? []);
      setCustomers(result.customers ?? []);
      setResetMessage(result.message ?? 'Đã cập nhật tài khoản.');
      setResetState('saved');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setResetMessage(
        error instanceof Error
          ? error.message
          : 'Không thể cập nhật tài khoản ở thời điểm này.',
      );
      setResetState('failed');
    } finally {
      setActiveAccountActionId('');
    }
  }

  async function uploadWorkbook() {
    if (!activeClient) {
      setUploadState('failed');
      setUploadMessage('Cần tạo khách hàng trước khi upload statement.');
      return;
    }

    if (!selectedFile || validation.state !== 'ready') return;

    setUploadState('uploading');
    setUploadMessage('');

    const body = new FormData();
    body.append('file', selectedFile);
    body.append('clientId', activeClient.id);
    body.append('period', selectedMonth);

    try {
      const response = await fetchWithSession('/api/admin/uploads', {
        method: 'POST',
        body,
      });
      const result = await readJsonResponse<{
        customer?: {
          latestPeriod: string | null;
          totalRevenue: number;
          totalRevenueVnd: number;
          uploadedMonths: number;
        };
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Upload bị từ chối (${response.status}).`,
        );
      }

      setUploadState('stored');
      if (result.customer) {
        setCustomers((currentCustomers) =>
          currentCustomers.map((customer) =>
            customer.id === activeClient.id
              ? {
                  ...customer,
                  latestPeriod:
                    result.customer?.latestPeriod ?? customer.latestPeriod,
                  totalRevenue:
                    result.customer?.totalRevenue ?? customer.totalRevenue,
                  totalRevenueVnd:
                    result.customer?.totalRevenueVnd ??
                    customer.totalRevenueVnd,
                  uploadedMonths:
                    result.customer?.uploadedMonths ?? customer.uploadedMonths,
                }
              : customer,
          ),
        );
      }
      setUploadMessage(result.message ?? 'Đã lưu file.');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setUploadState('failed');
      setUploadMessage(
        error instanceof Error
          ? error.message
          : 'Không thể upload file ở thời điểm này.',
      );
    }
  }

  function startCustomerEdit(customer: ManagedCustomerRow) {
    setEditingCustomerId(customer.id);
    setEditingCustomerName(customer.name);
    setEditingCustomerCode(customer.code);
    setEditingCustomerStatus(customer.status);
    setCustomerActionState('idle');
    setCustomerActionMessage('');
  }

  async function saveCustomerProfile(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!editingCustomerId || customerActionState === 'saving') return;

    setCustomerActionState('saving');
    setCustomerActionMessage('');

    try {
      const response = await fetchWithSession('/api/admin/customers', {
        body: JSON.stringify({
          clientId: editingCustomerId,
          code: editingCustomerCode,
          name: editingCustomerName,
          status: editingCustomerStatus,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể lưu khách hàng (${response.status}).`,
        );
      }

      setCustomers(result.customers ?? []);
      setCustomerActionMessage(result.message ?? 'Đã lưu khách hàng.');
      setCustomerActionState('saved');
      setEditingCustomerId('');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setCustomerActionMessage(
        error instanceof Error
          ? error.message
          : 'Không thể lưu khách hàng ở thời điểm này.',
      );
      setCustomerActionState('failed');
    }
  }

  async function archiveCustomer(customer: ManagedCustomerRow) {
    if (!isSuperAdmin || activeCustomerActionId) return;

    setActiveCustomerActionId(customer.id);
    setCustomerActionState('saving');
    setCustomerActionMessage('');

    try {
      const response = await fetchWithSession('/api/admin/customers', {
        body: JSON.stringify({
          action: 'archive',
          clientId: customer.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      });
      const result = await readJsonResponse<{
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ??
            `Không thể lưu trữ khách hàng (${response.status}).`,
        );
      }

      setCustomers(result.customers ?? []);
      setCustomerActionMessage(result.message ?? 'Đã lưu trữ khách hàng.');
      setCustomerActionState('saved');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setCustomerActionMessage(
        error instanceof Error
          ? error.message
          : 'Không thể lưu trữ khách hàng ở thời điểm này.',
      );
      setCustomerActionState('failed');
    } finally {
      setActiveCustomerActionId('');
    }
  }

  async function deleteCustomer(customer: ManagedCustomerRow) {
    if (!isSuperAdmin || activeCustomerActionId) return;

    setActiveCustomerActionId(customer.id);
    setCustomerActionState('saving');
    setCustomerActionMessage('');

    try {
      const response = await fetchWithSession('/api/admin/customers', {
        body: JSON.stringify({
          action: 'delete',
          clientId: customer.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      });
      const result = await readJsonResponse<{
        customers?: ManagedCustomerRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể xoá khách hàng (${response.status}).`,
        );
      }

      setCustomers(result.customers ?? []);
      setCustomerActionMessage(result.message ?? 'Đã xoá khách hàng.');
      setCustomerActionState('saved');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setCustomerActionMessage(
        error instanceof Error
          ? error.message
          : 'Không thể xoá khách hàng ở thời điểm này.',
      );
      setCustomerActionState('failed');
    } finally {
      setCustomerDeleteTarget(null);
      setActiveCustomerActionId('');
    }
  }

  async function updateStatement(
    statement: AdminStatementRow,
    action: StatementAction,
  ) {
    if (activeStatementActionId) return;

    setActiveStatementActionId(statement.reportPeriodId);
    setStatementActionState('idle');
    setStatementActionMessage('');

    try {
      const response = await fetchWithSession('/api/admin/statements', {
        body: JSON.stringify({
          action,
          reportPeriodId: statement.reportPeriodId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        message?: string;
        overview?: AdminOverviewData;
        statements?: AdminStatementRow[];
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ??
            `Không thể cập nhật statement (${response.status}).`,
        );
      }

      setOverview(result.overview ?? overview);
      setStatementRows(result.statements ?? []);
      setStatementActionMessage(result.message ?? 'Đã cập nhật statement.');
      setStatementActionState('saved');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setStatementActionMessage(
        error instanceof Error
          ? error.message
          : 'Không thể cập nhật statement ở thời điểm này.',
      );
      setStatementActionState('failed');
    } finally {
      setActiveStatementActionId('');
    }
  }

  async function deleteStatement(statement: AdminStatementRow) {
    if (!isSuperAdmin || activeStatementActionId) return;

    setActiveStatementActionId(statement.reportPeriodId);
    setStatementActionState('idle');
    setStatementActionMessage('');

    try {
      const response = await fetchWithSession('/api/admin/statements', {
        body: JSON.stringify({
          reportPeriodId: statement.reportPeriodId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      });
      const result = await readJsonResponse<{
        message?: string;
        overview?: AdminOverviewData;
        statements?: AdminStatementRow[];
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể xoá statement (${response.status}).`,
        );
      }

      setOverview(result.overview ?? overview);
      setStatementRows(result.statements ?? []);
      setStatementActionMessage(result.message ?? 'Đã xoá statement.');
      setStatementActionState('saved');
      await refreshAdminSnapshot(selectedMonth);
    } catch (error) {
      setStatementActionMessage(
        error instanceof Error
          ? error.message
          : 'Không thể xoá statement ở thời điểm này.',
      );
      setStatementActionState('failed');
    } finally {
      setStatementDeleteTarget(null);
      setActiveStatementActionId('');
    }
  }

  function prepareStatementReplace(statement: AdminStatementRow) {
    setSelectedClient(statement.clientId);
    setSelectedMonth(statement.period);
    setUploadState('idle');
    setUploadMessage('');
    document.getElementById('admin-upload-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[88px_minmax(0,1fr)] max-lg:block">
        <ConsoleRail variant="admin" />

        <section className="min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 px-5 py-4 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark className="lg:hidden" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Zuong Zero Artist Portal
                  </p>
                  <h1 className="font-display truncate text-2xl font-semibold md:text-3xl">
                    Admin Operations
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="h-8 rounded-lg bg-[#e7fbf7] px-3 text-[#00796f]"
                  variant="secondary"
                >
                  <ShieldCheck className="size-3.5" />
                  {isSuperAdmin ? 'Super admin' : 'Quản lý'}
                </Badge>
                <Badge
                  className="h-8 max-w-[280px] truncate rounded-lg bg-white px-3 text-[#1f2937]"
                  variant="outline"
                >
                  {userEmail}
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
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
                  onClick={() => {
                    window.location.assign('/');
                  }}
                  type="button"
                >
                  Client portal
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

          <div className="min-w-0 space-y-5 px-5 py-5 md:px-8 md:py-7">
            <Tabs className="min-w-0 space-y-5" defaultValue="overview">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <TabsList className="min-h-11 w-full max-w-full flex-wrap items-center justify-start gap-1 overflow-visible rounded-lg border border-border/80 bg-white p-1 shadow-sm sm:w-fit">
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="overview"
                  >
                    <BarChart3 className="size-4" />
                    Tổng quan
                  </TabsTrigger>
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="customers"
                  >
                    <Users className="size-4" />
                    Khách hàng
                  </TabsTrigger>
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="statements"
                  >
                    <FileSpreadsheet className="size-4" />
                    Statement
                  </TabsTrigger>
                  {isSuperAdmin ? (
                    <TabsTrigger
                      className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                      value="accounts"
                    >
                      <ShieldCheck className="size-4" />
                      Tài khoản
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                <div className="w-full sm:w-[240px]">
                  <Select
                    onValueChange={(value) => {
                      if (value) setSelectedMonth(value);
                    }}
                    value={selectedMonth}
                  >
                    <SelectTrigger
                      aria-label="Tháng dashboard admin"
                      className="music-control h-10 w-full bg-white"
                    >
                      <span className="flex-1 truncate text-left">
                        {selectedMonthLabel}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {adminMonthOptions.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <TabsContent className="space-y-5" value="overview">
                <section className="music-card overflow-hidden">
                  <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="p-4 md:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className="rounded-lg bg-[#e7fbf7] text-[#00796f]"
                          variant="secondary"
                        >
                          <Disc3 className="size-3.5" />
                          Music catalog ops
                        </Badge>
                        <Badge className="rounded-lg" variant="outline">
                          {overview.monthLabel}
                        </Badge>
                      </div>
                      <h2 className="font-display mt-4 text-2xl font-semibold md:text-3xl">
                        Admin dashboard tổng
                      </h2>
                      {operationsMessage ? (
                        <p className="mt-3 rounded-lg border border-[#f0b7b2] bg-[#fff2f0] px-3 py-2 text-sm text-[#a53a30]">
                          {operationsMessage}
                        </p>
                      ) : null}
                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="border-t border-border pt-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Active clients
                            </span>
                            <Users className="size-4 text-primary" />
                          </div>
                          <p className="font-display mt-3 text-2xl font-semibold">
                            {formatNumber(activeCustomerCount)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatNumber(overview.summary.reportingCustomers)}{' '}
                            có dữ liệu /{' '}
                            {formatNumber(overview.summary.missingCustomers)}{' '}
                            trống
                          </p>
                        </div>
                        <div className="border-t border-border pt-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Statements
                            </span>
                            <FileSpreadsheet className="size-4 text-[#7c3aed]" />
                          </div>
                          <p className="font-display mt-3 text-2xl font-semibold">
                            {formatNumber(uploadedMonthCount)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatNumber(overview.summary.trackCount)} tracks /{' '}
                            {formatNumber(overview.summary.artistCount)} artists
                          </p>
                        </div>
                        <div className="border-t border-border pt-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Revenue
                            </span>
                            <WalletCards className="size-4 text-[#ff4d6d]" />
                          </div>
                          <p className="font-display mt-3 truncate text-2xl font-semibold">
                            {formatMoney(totalUsdRevenue)}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {formatMoney(overview.summary.revenueVnd, 'VND')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-white/10 bg-[#071118] p-5 text-white lg:border-l lg:border-t-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <RadioTower className="size-4 text-[#00b8a9]" />
                          Upload pipeline
                        </div>
                        <Badge className="rounded-lg border-white/15 bg-white/10 text-white">
                          Secure
                        </Badge>
                      </div>
                      <EqualizerBars className="mt-7" />
                      <div className="mt-7 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-white/55">Month</p>
                          <p className="mt-1 truncate text-lg font-semibold">
                            {overview.monthLabel}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/55">Usage</p>
                          <p className="mt-1 text-lg font-semibold">
                            {formatNumber(overview.summary.units)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
                  <section className="music-card p-4 md:p-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          System revenue
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Doanh thu toàn bộ khách hàng
                        </h2>
                      </div>
                      <BarChart3 className="size-5 text-primary" />
                    </div>
                    <AdminRevenueTrendChart data={overview.monthlyTrend} />
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Customer ranking
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Top khách hàng tháng này
                        </h2>
                      </div>
                      <WalletCards className="size-5 text-[#ff4d6d]" />
                    </div>
                    <TopCustomerList customers={overview.topCustomers} />
                  </section>
                </section>

                <section className="grid gap-4 xl:grid-cols-4">
                  <TrendList
                    icon={<Music2 className="size-5 text-primary" />}
                    items={overview.trendingTracks}
                    title="Track đang trend"
                  />
                  <TrendList
                    icon={<Mic2 className="size-5 text-[#7c3aed]" />}
                    items={overview.trendingArtists}
                    title="Artist đang trend"
                  />
                  <TrendList
                    icon={<RadioTower className="size-5 text-[#f59e0b]" />}
                    items={overview.topSources}
                    title="Top platform"
                  />
                  <TrendList
                    icon={<Disc3 className="size-5 text-[#ff4d6d]" />}
                    items={overview.topTerritories}
                    title="Top territory"
                  />
                </section>

                <ActivityLogPanel activityRows={activityRows.slice(0, 6)} />
              </TabsContent>

              <TabsContent className="space-y-5" value="customers">
                <section className="music-card p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Khách hàng</h2>
                    <Users className="size-5 text-primary" />
                  </div>

                  {customerActionMessage ? (
                    <p
                      className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                        customerActionState === 'failed'
                          ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                          : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                      }`}
                    >
                      {customerActionMessage}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative block">
                      <span className="sr-only">Tìm khách hàng</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        aria-label="Tìm khách hàng"
                        className="pl-9"
                        onChange={(event) =>
                          setCustomerSearch(event.target.value)
                        }
                        placeholder="Tìm tên, mã, email..."
                        value={customerSearch}
                      />
                    </div>
                    <Select
                      onValueChange={(value) => {
                        if (
                          value === 'all' ||
                          value === 'active' ||
                          value === 'locked' ||
                          value === 'archived'
                        ) {
                          setCustomerStatusFilter(value);
                        }
                      }}
                      value={customerStatusFilter}
                    >
                      <SelectTrigger
                        aria-label="Lọc trạng thái khách hàng"
                        className="music-control h-10 w-full bg-white"
                      >
                        <span className="flex-1 truncate text-left">
                          {customerStatusFilterLabel(customerStatusFilter)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả trạng thái</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="locked">Locked</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleCustomers.length > 0 ? (
                          visibleCustomers.map((client) => (
                            <TableRow key={client.id}>
                              <TableCell className="font-medium">
                                <span className="block">{client.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {client.code}
                                </span>
                              </TableCell>
                              <TableCell>{client.viewerEmail ?? '-'}</TableCell>
                              <TableCell>
                                {client.latestPeriod ?? '-'}
                              </TableCell>
                              <TableCell>
                                {formatNumber(client.uploadedMonths)}
                              </TableCell>
                              <TableCell>
                                <span className="block">
                                  {formatMoney(client.totalRevenue, 'USD')}
                                </span>
                                {client.totalRevenueVnd > 0 ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {formatMoney(client.totalRevenueVnd, 'VND')}
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Badge className="rounded-lg" variant="outline">
                                  {customerStatusLabel(client.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    className="h-9"
                                    onClick={() => startCustomerEdit(client)}
                                    type="button"
                                    variant="outline"
                                  >
                                    <Edit3 className="size-4" />
                                    Sửa
                                  </Button>
                                  {isSuperAdmin ? (
                                    <>
                                      <Button
                                        className="h-9"
                                        disabled={
                                          activeCustomerActionId ===
                                            client.id ||
                                          client.status === 'archived'
                                        }
                                        onClick={() => {
                                          void archiveCustomer(client);
                                        }}
                                        type="button"
                                        variant="outline"
                                      >
                                        <Archive className="size-4" />
                                        Archive
                                      </Button>
                                      <Button
                                        className="h-9 border-[#f0b7b2] text-[#a53a30] hover:bg-[#fff2f0]"
                                        disabled={
                                          activeCustomerActionId === client.id
                                        }
                                        onClick={() => {
                                          setCustomerDeleteTarget(client);
                                        }}
                                        type="button"
                                        variant="outline"
                                      >
                                        <Trash2 className="size-4" />
                                        Xoá
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              className="h-24 text-center text-sm text-muted-foreground"
                              colSpan={7}
                            >
                              {customers.length > 0
                                ? 'Không có khách hàng khớp bộ lọc.'
                                : 'Chưa có khách hàng.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <Dialog
                    onOpenChange={(open) => {
                      if (!open) setEditingCustomerId('');
                    }}
                    open={Boolean(editingCustomerId)}
                  >
                    <DialogContent className="sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Sửa khách hàng</DialogTitle>
                      </DialogHeader>
                      <form
                        className="grid gap-4"
                        onSubmit={saveCustomerProfile}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <span className="block text-sm font-medium">
                              Tên khách hàng
                            </span>
                            <Input
                              onChange={(event) => {
                                setEditingCustomerName(event.target.value);
                              }}
                              required
                              value={editingCustomerName}
                            />
                          </div>
                          <div className="space-y-2">
                            <span className="block text-sm font-medium">
                              Mã khách hàng
                            </span>
                            <Input
                              autoCapitalize="characters"
                              onChange={(event) => {
                                setEditingCustomerCode(event.target.value);
                              }}
                              required
                              value={editingCustomerCode}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="block text-sm font-medium">
                            Trạng thái
                          </span>
                          <Select
                            onValueChange={(value) => {
                              if (
                                value === 'active' ||
                                value === 'locked' ||
                                value === 'archived'
                              ) {
                                setEditingCustomerStatus(value);
                              }
                            }}
                            value={editingCustomerStatus}
                          >
                            <SelectTrigger
                              aria-label="Trạng thái khách hàng"
                              className="music-control h-10 w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="locked">Locked</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => setEditingCustomerId('')}
                            type="button"
                            variant="outline"
                          >
                            Huỷ
                          </Button>
                          <Button
                            className="bg-[#00796f] text-white hover:bg-[#006c64]"
                            disabled={customerActionState === 'saving'}
                            type="submit"
                          >
                            <Save className="size-4" />
                            {customerActionState === 'saving'
                              ? 'Đang lưu'
                              : 'Lưu'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </section>
              </TabsContent>

              {isSuperAdmin ? (
                <TabsContent className="space-y-5" value="accounts">
                  <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                    <section className="music-card p-4 md:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-semibold">Tạo tài khoản</h2>
                        <UserPlus className="size-5 text-primary" />
                      </div>

                      <form
                        className="mt-5 grid gap-3"
                        onSubmit={createManagedAccount}
                      >
                        <div className="space-y-2">
                          <span className="block text-sm font-medium">
                            Email
                          </span>
                          <Input
                            autoComplete="email"
                            inputMode="email"
                            onChange={(event) => {
                              setAccountEmail(event.target.value);
                            }}
                            placeholder="name@company.com"
                            required
                            type="email"
                            value={accountEmail}
                          />
                        </div>

                        {accountRole === 'admin' ? (
                          <div className="space-y-2">
                            <span className="block text-sm font-medium">
                              Tên hiển thị
                            </span>
                            <Input
                              autoComplete="name"
                              onChange={(event) => {
                                setAccountDisplayName(event.target.value);
                              }}
                              placeholder="Tên người quản lý"
                              value={accountDisplayName}
                            />
                          </div>
                        ) : null}

                        {accountRole === 'client' ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <span className="block text-sm font-medium">
                                Tên khách hàng
                              </span>
                              <Input
                                autoComplete="organization"
                                onChange={(event) => {
                                  setAccountClientName(event.target.value);
                                }}
                                placeholder="Tên công ty hoặc catalog"
                                required
                                value={accountClientName}
                              />
                            </div>
                            <div className="space-y-2">
                              <span className="block text-sm font-medium">
                                Mã khách hàng
                              </span>
                              <Input
                                autoCapitalize="characters"
                                onChange={(event) => {
                                  setAccountClientCode(event.target.value);
                                }}
                                placeholder="VD: VIEENT"
                                required
                                value={accountClientCode}
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <span className="block text-sm font-medium">
                              Role
                            </span>
                            <Select
                              onValueChange={(value) => {
                                if (value === 'admin' || value === 'client') {
                                  setAccountRole(value);
                                }
                              }}
                              value={accountRole}
                            >
                              <SelectTrigger
                                aria-label="Role"
                                className="music-control h-10 w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="client">
                                  Khách hàng
                                </SelectItem>
                                <SelectItem value="admin">Quản lý</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {accountRole === 'client' ? (
                            <div className="space-y-2">
                              <span className="block text-sm font-medium">
                                Quyền xem
                              </span>
                              <Select
                                onValueChange={(value) => {
                                  if (
                                    value === 'owner' ||
                                    value === 'viewer' ||
                                    value === 'finance'
                                  ) {
                                    setAccountAccessLevel(value);
                                  }
                                }}
                                value={accountAccessLevel}
                              >
                                <SelectTrigger
                                  aria-label="Quyền xem"
                                  className="music-control h-10 w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="finance">
                                    Finance
                                  </SelectItem>
                                  <SelectItem value="owner">Owner</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                        </div>

                        <Button
                          className="h-10 w-full bg-[#00796f] text-white hover:bg-[#006c64]"
                          disabled={accountState === 'saving'}
                          type="submit"
                        >
                          <UserPlus className="size-4" />
                          {accountState === 'saving'
                            ? 'Đang tạo...'
                            : 'Tạo và gửi link'}
                        </Button>
                      </form>

                      {accountMessage ? (
                        <p
                          className={`mt-3 text-sm leading-6 ${
                            accountState === 'failed'
                              ? 'text-[#a53a30]'
                              : 'text-[#22735f]'
                          }`}
                        >
                          {accountMessage}
                        </p>
                      ) : null}

                      {accountInviteUrl ? (
                        <div className="mt-3 grid gap-2">
                          <span className="block text-sm font-medium">
                            Link kích hoạt
                          </span>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                            <Input readOnly value={accountInviteUrl} />
                            <Button
                              className="h-10"
                              onClick={copyInviteUrl}
                              type="button"
                              variant="outline"
                            >
                              <Copy className="size-4" />
                              Copy
                            </Button>
                          </div>
                          {inviteCopyMessage ? (
                            <p className="text-sm text-muted-foreground">
                              {inviteCopyMessage}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </section>

                    <section className="music-card p-4 md:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                          Tài khoản hệ thống
                        </h2>
                        <ShieldCheck className="size-5 text-primary" />
                      </div>

                      {resetMessage ? (
                        <p
                          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                            resetState === 'failed'
                              ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                              : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                          }`}
                        >
                          {resetMessage}
                        </p>
                      ) : null}

                      {resetInviteUrl ? (
                        <div className="mt-3 grid gap-2">
                          <span className="block text-sm font-medium">
                            Link mới
                          </span>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                            <Input readOnly value={resetInviteUrl} />
                            <Button
                              className="h-10"
                              onClick={copyResetUrl}
                              type="button"
                              variant="outline"
                            >
                              <Copy className="size-4" />
                              Copy
                            </Button>
                          </div>
                          {resetCopyMessage ? (
                            <p className="text-sm text-muted-foreground">
                              {resetCopyMessage}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {managedAccounts.length > 0 ? (
                        <div className="mt-4 overflow-hidden rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last seen</TableHead>
                                <TableHead>Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {managedAccounts.map((account) => (
                                <TableRow
                                  key={`${account.id}:${account.clientId}`}
                                >
                                  <TableCell className="font-medium">
                                    <span className="block">
                                      {account.email}
                                    </span>
                                    {account.displayName ? (
                                      <span className="text-xs text-muted-foreground">
                                        {account.displayName}
                                      </span>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className={accountRoleClass(account.role)}
                                      variant="secondary"
                                    >
                                      {accountRoleLabel(account.role)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <span className="block">
                                      {account.clientName ?? 'Không gán client'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {accessLevelLabel(account.accessLevel)}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className="rounded-lg"
                                      variant="outline"
                                    >
                                      {accountStatusLabel(account)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {account.lastSeenAt
                                      ? formatAccountDate(account.lastSeenAt)
                                      : 'Chưa đăng nhập'}
                                  </TableCell>
                                  <TableCell>
                                    {account.role === 'super_admin' ? (
                                      <span className="text-sm text-muted-foreground">
                                        -
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          className="h-9"
                                          disabled={
                                            resettingAccountId === account.id ||
                                            Boolean(resettingAccountId)
                                          }
                                          onClick={() => {
                                            void sendAccountLink(account);
                                          }}
                                          type="button"
                                          variant="outline"
                                        >
                                          <Mail className="size-4" />
                                          {resettingAccountId === account.id
                                            ? 'Đang gửi'
                                            : 'Gửi link'}
                                        </Button>
                                        <Button
                                          className={`h-9 ${
                                            account.status === 'active'
                                              ? 'border-[#f0b7b2] text-[#a53a30] hover:bg-[#fff2f0]'
                                              : ''
                                          }`}
                                          disabled={
                                            activeAccountActionId ===
                                              account.id ||
                                            Boolean(activeAccountActionId)
                                          }
                                          onClick={() => {
                                            void toggleAccountStatus(account);
                                          }}
                                          type="button"
                                          variant="outline"
                                        >
                                          <LockKeyhole className="size-4" />
                                          {activeAccountActionId === account.id
                                            ? 'Đang lưu'
                                            : account.status === 'active'
                                              ? 'Khoá'
                                              : 'Mở'}
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="mt-4 rounded-lg border border-dashed border-border bg-white p-4 text-sm leading-6 text-muted-foreground">
                          {accountState === 'loading'
                            ? 'Đang tải tài khoản...'
                            : 'Chưa có tài khoản.'}
                        </p>
                      )}
                    </section>
                  </section>
                </TabsContent>
              ) : null}

              <TabsContent className="space-y-5" value="statements">
                <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  <section
                    className="music-card p-4 md:p-5"
                    id="admin-upload-panel"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold">
                        Upload dữ liệu tháng
                      </h2>
                      <FileSpreadsheet className="size-6 text-primary" />
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="space-y-2">
                        <span className="block text-sm font-medium">
                          Khách hàng
                        </span>
                        <Select
                          onValueChange={(value) => {
                            if (value) setSelectedClient(value);
                          }}
                          value={selectedClient}
                        >
                          <SelectTrigger
                            aria-label="Khách hàng"
                            className="music-control h-10 w-full"
                          >
                            <span className="flex-1 truncate text-left">
                              {activeClient?.name ?? 'Chọn khách hàng'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-sm font-medium">
                          Tháng dữ liệu
                        </span>
                        <Select
                          onValueChange={(value) => {
                            if (value) setSelectedMonth(value);
                          }}
                          value={selectedMonth}
                        >
                          <SelectTrigger
                            aria-label="Tháng dữ liệu"
                            className="music-control h-10 w-full"
                          >
                            <span className="flex-1 truncate text-left">
                              {selectedMonthLabel}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {adminMonthOptions.map((month) => (
                              <SelectItem key={month.value} value={month.value}>
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <label className="mt-5 flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#71dcd2] bg-[#edfdfb] px-4 py-6 text-center transition hover:border-[#00b8a9] hover:bg-[#e6fbf8]">
                      <Upload className="size-7 text-primary" />
                      <span className="mt-3 text-sm font-semibold text-[#24434a]">
                        Chọn file .xlsx
                      </span>
                      <span className="mt-1 text-sm text-muted-foreground">
                        Tối đa 15MB
                      </span>
                      <input
                        accept=".xlsx"
                        className="sr-only"
                        type="file"
                        onChange={(event) => {
                          setSelectedFile(event.target.files?.[0] ?? null);
                          setUploadState('idle');
                          setUploadMessage('');
                        }}
                      />
                    </label>

                    <div className="mt-4 rounded-lg border border-border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                          Kiểm tra file
                        </span>
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
                      className="mt-4 h-10 w-full bg-[#071118] text-white hover:bg-[#111827]"
                      disabled={
                        validation.state !== 'ready' ||
                        uploadState === 'uploading'
                      }
                      onClick={uploadWorkbook}
                    >
                      <FolderLock className="size-4" />
                      {uploadState === 'uploading' ? 'Đang lưu...' : 'Lưu file'}
                    </Button>
                    {uploadMessage ? (
                      <p
                        className={`mt-3 text-sm leading-6 ${
                          uploadState === 'failed'
                            ? 'text-[#a53a30]'
                            : 'text-[#22735f]'
                        }`}
                      >
                        {uploadMessage}
                      </p>
                    ) : null}
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Statement ledger
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Quản lý statement
                        </h2>
                      </div>
                      <RefreshCw
                        className={`size-5 text-primary ${
                          operationsState === 'loading' ? 'animate-spin' : ''
                        }`}
                      />
                    </div>

                    {statementActionMessage ? (
                      <p
                        className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                          statementActionState === 'failed'
                            ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                            : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                        }`}
                      >
                        {statementActionMessage}
                      </p>
                    ) : null}

                    <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="relative block">
                        <span className="sr-only">Tìm statement</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          aria-label="Tìm statement"
                          className="pl-9"
                          onChange={(event) =>
                            setStatementSearch(event.target.value)
                          }
                          placeholder="Tìm client, file, kỳ..."
                          value={statementSearch}
                        />
                      </div>
                      <Select
                        onValueChange={(value) => {
                          if (
                            value === 'all' ||
                            value === 'draft' ||
                            value === 'validating' ||
                            value === 'published' ||
                            value === 'locked' ||
                            value === 'replaced'
                          ) {
                            setStatementStatusFilter(value);
                          }
                        }}
                        value={statementStatusFilter}
                      >
                        <SelectTrigger
                          aria-label="Lọc trạng thái statement"
                          className="music-control h-10 w-full bg-white"
                        >
                          <span className="flex-1 truncate text-left">
                            {statementStatusFilterLabel(statementStatusFilter)}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả status</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="locked">Locked</SelectItem>
                          <SelectItem value="replaced">Hidden</SelectItem>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="validating">Validating</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Rows</TableHead>
                          <TableHead>Units</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Closing</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleStatementRows.length > 0 ? (
                          visibleStatementRows.map((statement) => (
                            <TableRow key={statement.reportPeriodId}>
                              <TableCell className="font-medium">
                                <span className="block">
                                  {statement.clientName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {statement.clientCode}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="block">
                                  {statement.periodLabel}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {statement.currency}
                                </span>
                              </TableCell>
                              <TableCell>
                                {formatNumber(statement.rowCount)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(statement.units)}
                              </TableCell>
                              <TableCell>
                                {formatMoney(
                                  statement.revenue,
                                  statement.currency,
                                )}
                              </TableCell>
                              <TableCell>
                                {formatMoney(
                                  statement.closing,
                                  statement.currency,
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge className="rounded-lg" variant="outline">
                                  {statementStatusLabel(statement.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    className="h-9"
                                    onClick={() =>
                                      prepareStatementReplace(statement)
                                    }
                                    type="button"
                                    variant="outline"
                                  >
                                    <Upload className="size-4" />
                                    Replace
                                  </Button>
                                  {statement.status === 'published' ? (
                                    <>
                                      <Button
                                        className="h-9"
                                        disabled={
                                          activeStatementActionId ===
                                          statement.reportPeriodId
                                        }
                                        onClick={() => {
                                          void updateStatement(
                                            statement,
                                            'unpublish',
                                          );
                                        }}
                                        type="button"
                                        variant="outline"
                                      >
                                        <EyeOff className="size-4" />
                                        Ẩn
                                      </Button>
                                      <Button
                                        className="h-9"
                                        disabled={
                                          activeStatementActionId ===
                                          statement.reportPeriodId
                                        }
                                        onClick={() => {
                                          void updateStatement(
                                            statement,
                                            'lock',
                                          );
                                        }}
                                        type="button"
                                        variant="outline"
                                      >
                                        <LockKeyhole className="size-4" />
                                        Lock
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      className="h-9"
                                      disabled={
                                        activeStatementActionId ===
                                        statement.reportPeriodId
                                      }
                                      onClick={() => {
                                        void updateStatement(
                                          statement,
                                          'publish',
                                        );
                                      }}
                                      type="button"
                                      variant="outline"
                                    >
                                      <RefreshCw className="size-4" />
                                      {statement.status === 'locked'
                                        ? 'Mở lại'
                                        : 'Publish'}
                                    </Button>
                                  )}
                                  {isSuperAdmin ? (
                                    <Button
                                      className="h-9 border-[#f0b7b2] text-[#a53a30] hover:bg-[#fff2f0]"
                                      disabled={
                                        activeStatementActionId ===
                                        statement.reportPeriodId
                                      }
                                      onClick={() =>
                                        setStatementDeleteTarget(statement)
                                      }
                                      type="button"
                                      variant="outline"
                                    >
                                      <Trash2 className="size-4" />
                                      Xoá
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              className="h-24 text-center text-sm text-muted-foreground"
                              colSpan={8}
                            >
                              {statementRows.length > 0
                                ? 'Không có statement khớp bộ lọc.'
                                : 'Chưa có statement trong tháng đang chọn.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </section>
                </section>
                <ActivityLogPanel activityRows={activityRows} />
              </TabsContent>
            </Tabs>

            <AlertDialog
              onOpenChange={(open) => {
                if (!open) setCustomerDeleteTarget(null);
              }}
              open={Boolean(customerDeleteTarget)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-[#fff2f0] text-[#a53a30]">
                    <Trash2 className="size-5" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Xoá khách hàng</AlertDialogTitle>
                  <AlertDialogDescription>
                    Khách hàng, statement và file upload liên quan sẽ bị xoá
                    khỏi hệ thống.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[#a53a30] text-white hover:bg-[#8f2f27]"
                    disabled={Boolean(activeCustomerActionId)}
                    onClick={() => {
                      if (customerDeleteTarget) {
                        void deleteCustomer(customerDeleteTarget);
                      }
                    }}
                  >
                    Xoá
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
              onOpenChange={(open) => {
                if (!open) setStatementDeleteTarget(null);
              }}
              open={Boolean(statementDeleteTarget)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-[#fff2f0] text-[#a53a30]">
                    <Trash2 className="size-5" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Xoá statement</AlertDialogTitle>
                  <AlertDialogDescription>
                    Statement và toàn bộ breakdown của kỳ này sẽ bị xoá khỏi hệ
                    thống.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[#a53a30] text-white hover:bg-[#8f2f27]"
                    disabled={Boolean(activeStatementActionId)}
                    onClick={() => {
                      if (statementDeleteTarget) {
                        void deleteStatement(statementDeleteTarget);
                      }
                    }}
                  >
                    Xoá
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </div>
    </main>
  );
}

function ActivityLogPanel({
  activityRows,
}: {
  activityRows: AdminActivityRow[];
}) {
  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Audit trail
          </p>
          <h2 className="mt-1 text-lg font-semibold">Hoạt động gần đây</h2>
        </div>
        <Activity className="size-5 text-primary" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Hành động</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Người thực hiện</TableHead>
              <TableHead>Chi tiết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activityRows.length > 0 ? (
              activityRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatAccountDate(row.createdAt)}</TableCell>
                  <TableCell className="font-medium">
                    {row.actionLabel}
                  </TableCell>
                  <TableCell>
                    <span className="block">{row.clientName ?? '-'}</span>
                    {row.clientCode ? (
                      <span className="text-xs text-muted-foreground">
                        {row.clientCode}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="block">{row.actorEmail ?? '-'}</span>
                    {row.actorDisplayName ? (
                      <span className="text-xs text-muted-foreground">
                        {row.actorDisplayName}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {row.summary || row.targetId}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-sm text-muted-foreground"
                  colSpan={5}
                >
                  Chưa có hoạt động.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AdminRevenueTrendChart({
  data,
}: {
  data: AdminOverviewData['monthlyTrend'];
}) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[310px] items-center justify-center rounded-lg border border-dashed border-border bg-white text-center">
        <div>
          <BarChart3 className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm font-medium">Chưa có doanh thu</p>
        </div>
      </div>
    );
  }

  const maxUsd = Math.max(...data.map((point) => point.usd), 1);

  return (
    <div className="grid min-h-[310px] grid-cols-[48px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-3 overflow-hidden pb-3">
        {data.map((point, index) => (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={point.period}
          >
            <div className="flex h-[230px] w-full items-end border-b border-border">
              <div
                aria-label={`${point.label}: ${formatMoney(point.usd)}`}
                className="w-full rounded-t-md"
                style={{
                  backgroundColor: adminPalette[index % adminPalette.length],
                  height: `${Math.max(4, (point.usd / maxUsd) * 100)}%`,
                }}
              />
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {point.label.replace('202', "'2")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCustomerList({
  customers,
}: {
  customers: AdminOverviewData['topCustomers'];
}) {
  if (customers.length === 0) {
    return (
      <div className="flex min-h-[310px] items-center justify-center rounded-lg border border-dashed border-border bg-white text-center">
        <div>
          <Users className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm font-medium">Chưa có khách hàng</p>
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...customers.map((customer) => customer.usd), 1);

  return (
    <div className="grid gap-3">
      {customers.map((customer, index) => (
        <div
          className="rounded-lg border border-border bg-white p-3"
          key={customer.clientId}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {customer.clientName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {customer.clientCode} / {customer.latestPeriod ?? '-'}
              </p>
            </div>
            <Badge className="rounded-lg" variant="outline">
              #{index + 1}
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#00b8a9]"
              style={{
                width: `${Math.max(5, (customer.usd / maxRevenue) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{formatMoney(customer.usd)}</span>
            <span className="text-muted-foreground">
              {formatNumber(customer.units)} units
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendList({
  icon,
  items,
  title,
}: {
  icon: ReactNode;
  items: AdminTrendItem[];
  title: string;
}) {
  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {icon}
      </div>
      {items.length > 0 ? (
        <div className="grid gap-3">
          {items.slice(0, 6).map((item, index) => (
            <div
              className="rounded-lg border border-border bg-white p-3"
              key={`${item.label}:${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {item.label}
                </p>
                <Badge
                  className={`rounded-lg ${trendClass(item.trend)}`}
                  variant="secondary"
                >
                  {trendLabel(item.trend)}
                </Badge>
              </div>
              <p className="font-display mt-3 truncate text-xl font-semibold">
                {formatMoney(item.usd)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(item.units)} units /{' '}
                {formatNumber(item.clientCount)} clients
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[190px] items-center justify-center rounded-lg border border-dashed border-border bg-white text-center">
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        </div>
      )}
    </section>
  );
}
