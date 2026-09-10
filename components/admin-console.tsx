'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  AlertTriangle,
  BarChart3,
  BellRing,
  CheckCircle2,
  Copy,
  Disc3,
  Download,
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
  Send,
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
import { ChartHoverTooltip } from '@/components/chart-hover-tooltip';
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
  type ConsoleRailItem,
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
import {
  TablePagination,
  usePaginatedRows,
} from '@/components/table-pagination';
import { buildCalendarQuarterOptions } from '@/lib/reporting-periods';
import { SETTLEMENT_THRESHOLD_VND } from '@/lib/settlements';
import { type AdminActivityRow } from '@/lib/admin-activity';
import {
  emptyAdminOverviewData,
  type AdminOverviewData,
  type AdminStatementRow,
  type AdminTrendItem,
} from '@/lib/admin-dashboard';
import type { TrackGuaranteeRow, TrackGuaranteeStatus } from '@/lib/guarantees';

type AdminRole = 'super_admin' | 'admin';
type ManagedAccountRole = 'admin' | 'client';
type ClientAccessLevel = 'owner' | 'viewer' | 'finance' | 'uploader';

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
  uploadedQuarters: number;
  totalRevenue: number;
  status: CustomerStatus;
};

type CustomerStatus = 'active' | 'locked' | 'archived';
type CustomerActionState = 'idle' | 'saving' | 'saved' | 'failed';
type StatementAction = 'publish' | 'unpublish' | 'lock';
type CustomerStatusFilter = 'all' | CustomerStatus;
type StatementStatusFilter = 'all' | AdminStatementRow['status'];
type GuaranteeStatusFilter = 'all' | TrackGuaranteeStatus;
type UploadMode = 'single' | 'bulk';
type ReminderActionState = 'idle' | 'saving' | 'saved' | 'failed';
type EmailActionState = 'idle' | 'loading' | 'saving' | 'saved' | 'failed';
type AdminTab =
  | 'overview'
  | 'customers'
  | 'accounts'
  | 'statements'
  | 'guarantees'
  | 'reminders'
  | 'email';

const adminTabs = new Set<AdminTab>([
  'overview',
  'customers',
  'accounts',
  'statements',
  'guarantees',
  'reminders',
  'email',
]);

type EmailProductionStatusRow = {
  apiKeyConfigured: boolean;
  checkedAt: string;
  dmarc: {
    records: string[];
    status: 'present' | 'missing' | 'unknown';
  };
  fromAddress: string | null;
  fromConfigured: boolean;
  fromDomain: string | null;
  issues: string[];
  portalUrl: string;
  productionReady: boolean;
  resendDomain: {
    id: string;
    name: string;
    records: Array<{
      name: string;
      record: string;
      status:
        | 'not_started'
        | 'pending'
        | 'verified'
        | 'failed'
        | 'temporary_failure'
        | 'unknown';
      type: string;
      value: string;
    }>;
    sending: string | null;
    status: string;
  } | null;
  resendReachable: boolean;
  sendingReady: boolean;
};

type ReminderRecipientRow = {
  accessLevel: ClientAccessLevel;
  canSend: boolean;
  carryForward: number;
  clientCode: string;
  clientId: string;
  clientName: string;
  displayName: string | null;
  email: string;
  latestPublishedAt: string | null;
  paidAmount: number;
  payable: number;
  period: string;
  periodLabel: string;
  settlementStatus: 'paid' | 'carried_forward' | 'no_statement';
  statementStatus: 'published' | 'locked' | 'missing';
  userId: string;
};

type ReminderRunRow = {
  createdAt: string;
  errorSummary: string | null;
  failedCount: number;
  id: string;
  notConfiguredCount: number;
  period: string;
  periodLabel: string;
  reminderDate: string;
  runType: 'scheduled' | 'manual' | 'dry_run' | 'retry';
  sentCount: number;
  skippedCount: number;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  targetCount: number;
  updatedAt: string;
};

const adminPalette = [
  '#00b8a9',
  '#ff4d6d',
  '#7c3aed',
  '#f59e0b',
  '#2563eb',
  '#111827',
];

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
    uploader: 'Uploader',
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

function adminStatementExportUrl(
  reportPeriodId: string,
  format: 'excel' | 'pdf',
) {
  return `/api/admin/statements/${encodeURIComponent(reportPeriodId)}/export?format=${format}`;
}

function settlementStatusLabel(status: AdminStatementRow['settlementStatus']) {
  return status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
}

function settlementBadgeClass(status: AdminStatementRow['settlementStatus']) {
  return status === 'paid'
    ? 'rounded-lg bg-[#e7fbf7] text-[#00796f]'
    : 'rounded-lg bg-[#fff8e7] text-[#986200]';
}

function settlementHelper(statement: AdminStatementRow) {
  if (statement.settlementStatus === 'paid') {
    return `Paid ${formatMoney(statement.paid)}`;
  }

  return `Qua quý sau ${formatMoney(statement.carryForward)}`;
}

function guaranteeStatusLabel(status: TrackGuaranteeStatus) {
  if (status === 'active') return 'Đang trừ GM';
  if (status === 'recouped') return 'Đã recoup';
  return 'Archived';
}

function guaranteeStatusFilterLabel(status: GuaranteeStatusFilter) {
  if (status === 'all') return 'Tất cả GM';
  return guaranteeStatusLabel(status);
}

function guaranteeBadgeClass(status: TrackGuaranteeStatus) {
  if (status === 'active') return 'rounded-lg bg-[#e7fbf7] text-[#00796f]';
  if (status === 'recouped') return 'rounded-lg bg-[#eef4ff] text-[#2f5da8]';
  return 'rounded-lg bg-muted text-muted-foreground';
}

function reminderStatementLabel(
  status: ReminderRecipientRow['statementStatus'],
) {
  if (status === 'published') return 'Published';
  if (status === 'locked') return 'Locked';
  return 'Chưa publish';
}

function reminderStatementClass(
  status: ReminderRecipientRow['statementStatus'],
) {
  if (status === 'published') return 'rounded-lg bg-[#e7fbf7] text-[#00796f]';
  if (status === 'locked') return 'rounded-lg bg-[#eef4ff] text-[#2f5da8]';
  return 'rounded-lg bg-[#fff8e7] text-[#986200]';
}

function reminderSettlementLabel(
  status: ReminderRecipientRow['settlementStatus'],
) {
  if (status === 'paid') return 'Đủ ngưỡng';
  if (status === 'carried_forward') return 'Carry forward';
  return 'Chưa có số liệu';
}

function reminderRunTypeLabel(type: ReminderRunRow['runType']) {
  if (type === 'scheduled') return 'Tự động';
  if (type === 'manual') return 'Gửi tay';
  if (type === 'dry_run') return 'Dry-run';
  return 'Retry';
}

function reminderRunStatusLabel(status: ReminderRunRow['status']) {
  if (status === 'completed') return 'Completed';
  if (status === 'partial') return 'Partial';
  if (status === 'failed') return 'Failed';
  return 'Skipped';
}

function reminderRunStatusClass(status: ReminderRunRow['status']) {
  if (status === 'completed') {
    return 'rounded-lg bg-[#e7fbf7] text-[#00796f]';
  }
  if (status === 'partial') return 'rounded-lg bg-[#fff8e7] text-[#986200]';
  if (status === 'failed') return 'rounded-lg bg-[#fff2f0] text-[#a53a30]';
  return 'rounded-lg bg-muted text-muted-foreground';
}

function emailReadyLabel(value: boolean) {
  return value ? 'Ready' : 'Action needed';
}

function emailReadyClass(value: boolean) {
  return value
    ? 'rounded-lg bg-[#e7fbf7] text-[#00796f]'
    : 'rounded-lg bg-[#fff8e7] text-[#986200]';
}

function emailRecordStatusLabel(status: string) {
  if (status === 'verified') return 'Verified';
  if (status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  if (status === 'temporary_failure') return 'Temporary failure';
  if (status === 'not_started') return 'Not started';
  return 'Unknown';
}

function emailRecordStatusClass(status: string) {
  if (status === 'verified') return 'rounded-lg bg-[#e7fbf7] text-[#00796f]';
  if (status === 'failed' || status === 'temporary_failure') {
    return 'rounded-lg bg-[#fff2f0] text-[#a53a30]';
  }
  if (status === 'pending' || status === 'not_started') {
    return 'rounded-lg bg-[#fff8e7] text-[#986200]';
  }

  return 'rounded-lg bg-muted text-muted-foreground';
}

function dmarcStatusLabel(status: EmailProductionStatusRow['dmarc']['status']) {
  if (status === 'present') return 'Present';
  if (status === 'missing') return 'Missing';
  return 'Unknown';
}

function parseVndInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return 0;

  return Number(digits);
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

function validateWorkbook(file: File | null, uploadMode: UploadMode) {
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
    message:
      uploadMode === 'bulk'
        ? 'File hợp lệ. Khi import, hệ thống sẽ kiểm tra cột Mã khách hàng/Client ID.'
        : 'File hợp lệ.',
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
  const adminQuarterOptions = useMemo(() => buildCalendarQuarterOptions(), []);
  const initialPeriod = adminQuarterOptions[0]?.value ?? '';
  const [customers, setCustomers] = useState<ManagedCustomerRow[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverviewData>(() =>
    emptyAdminOverviewData(initialPeriod),
  );
  const [statementRows, setStatementRows] = useState<AdminStatementRow[]>([]);
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
  const [uploadMode, setUploadMode] = useState<UploadMode>('single');
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
  const [guarantees, setGuarantees] = useState<TrackGuaranteeRow[]>([]);
  const [guaranteeClientId, setGuaranteeClientId] = useState('');
  const [guaranteeTrackExternalId, setGuaranteeTrackExternalId] = useState('');
  const [guaranteeTrackTitle, setGuaranteeTrackTitle] = useState('');
  const [guaranteeAmount, setGuaranteeAmount] = useState('');
  const [guaranteeNotes, setGuaranteeNotes] = useState('');
  const [guaranteeSearch, setGuaranteeSearch] = useState('');
  const [guaranteeStatusFilter, setGuaranteeStatusFilter] =
    useState<GuaranteeStatusFilter>('all');
  const [guaranteeState, setGuaranteeState] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [guaranteeMessage, setGuaranteeMessage] = useState('');
  const [activeGuaranteeActionId, setActiveGuaranteeActionId] = useState('');
  const [reminderRecipients, setReminderRecipients] = useState<
    ReminderRecipientRow[]
  >([]);
  const [reminderRuns, setReminderRuns] = useState<ReminderRunRow[]>([]);
  const [reminderState, setReminderState] =
    useState<ReminderActionState>('idle');
  const [reminderMessage, setReminderMessage] = useState('');
  const [emailStatus, setEmailStatus] =
    useState<EmailProductionStatusRow | null>(null);
  const [emailTestTo, setEmailTestTo] = useState(userEmail);
  const [emailState, setEmailState] = useState<EmailActionState>('loading');
  const [emailMessage, setEmailMessage] = useState('');

  const activeClient =
    customers.find((client) => client.id === selectedClient) ??
    customers[0] ??
    null;
  const activeGuaranteeClient =
    customers.find((client) => client.id === guaranteeClientId) ??
    customers[0] ??
    null;
  const selectedPeriodLabel =
    adminQuarterOptions.find((period) => period.value === selectedPeriod)
      ?.label ?? selectedPeriod;
  const adminRailItems = useMemo<ConsoleRailItem[]>(
    () => [
      { icon: BarChart3, id: 'overview', label: 'Tổng quan' },
      { icon: Users, id: 'customers', label: 'Khách hàng' },
      { icon: FileSpreadsheet, id: 'statements', label: 'Statement' },
      { icon: WalletCards, id: 'guarantees', label: 'GM' },
      { icon: BellRing, id: 'reminders', label: 'Nhắc lịch' },
      { icon: Mail, id: 'email', label: 'Email' },
      ...(isSuperAdmin
        ? [{ icon: ShieldCheck, id: 'accounts', label: 'Tài khoản' }]
        : []),
    ],
    [isSuperAdmin],
  );
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
          statement.filename,
          statement.period,
          settlementStatusLabel(statement.settlementStatus),
          statement.status,
        ])
      );
    });
  }, [statementRows, statementSearch, statementStatusFilter]);
  const visibleGuarantees = useMemo(() => {
    const query = guaranteeSearch.trim().toLowerCase();

    return guarantees.filter((guarantee) => {
      const statusMatches =
        guaranteeStatusFilter === 'all' ||
        guarantee.status === guaranteeStatusFilter;

      return (
        statusMatches &&
        rowMatchesSearch(query, [
          guarantee.clientCode,
          guarantee.clientName,
          guarantee.notes,
          guarantee.trackExternalId,
          guarantee.trackTitle,
          guarantee.status,
        ])
      );
    });
  }, [guarantees, guaranteeSearch, guaranteeStatusFilter]);
  const customerPage = usePaginatedRows(visibleCustomers);
  const accountPage = usePaginatedRows(managedAccounts);
  const statementPage = usePaginatedRows(visibleStatementRows);
  const guaranteePage = usePaginatedRows(visibleGuarantees);
  const reminderRecipientPage = usePaginatedRows(reminderRecipients);
  const reminderRunPage = usePaginatedRows(reminderRuns);
  const validation = useMemo(
    () => validateWorkbook(selectedFile, uploadMode),
    [selectedFile, uploadMode],
  );
  const activeCustomerCount = overview.summary.activeCustomers;
  const uploadedQuarterCount = overview.summary.statementCount;
  const totalRevenue = overview.summary.revenueVnd;
  const activeGuaranteeCount = guarantees.filter(
    (guarantee) => guarantee.status === 'active',
  ).length;
  const totalGuaranteeBalance = guarantees
    .filter((guarantee) => guarantee.status === 'active')
    .reduce((total, guarantee) => total + guarantee.balanceAmount, 0);
  const totalGuaranteeRecouped = guarantees.reduce(
    (total, guarantee) => total + guarantee.recoupedAmount,
    0,
  );
  const sendableReminderCount = reminderRecipients.filter(
    (recipient) => recipient.canSend,
  ).length;
  const missingReminderCount =
    reminderRecipients.length - sendableReminderCount;
  const latestRetryableReminderRun = reminderRuns.find(
    (run) => run.failedCount + run.notConfiguredCount > 0,
  );
  const emailDnsRecords = emailStatus?.resendDomain?.records ?? [];
  const isInitialLoading =
    operationsState === 'loading' &&
    customers.length === 0 &&
    statementRows.length === 0 &&
    guarantees.length === 0 &&
    !emailStatus;

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      try {
        setOperationsState('loading');
        setOverview(emptyAdminOverviewData(selectedPeriod));
        setStatementRows([]);
        setActivityRows([]);
        setGuarantees([]);
        setReminderRecipients([]);
        setReminderRuns([]);
        const [
          accountsResponse,
          overviewResponse,
          statementsResponse,
          activityResponse,
          guaranteesResponse,
          remindersResponse,
          emailResponse,
        ] = await Promise.all([
          fetchWithSession(
            isSuperAdmin ? '/api/admin/accounts' : '/api/admin/customers',
          ),
          fetchWithSession(
            `/api/admin/overview?period=${encodeURIComponent(selectedPeriod)}`,
          ),
          fetchWithSession(
            `/api/admin/statements?period=${encodeURIComponent(selectedPeriod)}`,
          ),
          fetchWithSession('/api/admin/activity?limit=12'),
          fetchWithSession('/api/admin/guarantees'),
          fetchWithSession(
            `/api/admin/reminders?period=${encodeURIComponent(selectedPeriod)}`,
          ),
          fetchWithSession('/api/admin/email'),
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
        const guaranteesResult = await readJsonResponse<{
          guarantees?: TrackGuaranteeRow[];
          message?: string;
        }>(guaranteesResponse);
        const remindersResult = await readJsonResponse<{
          message?: string;
          recipients?: ReminderRecipientRow[];
          runs?: ReminderRunRow[];
        }>(remindersResponse);
        const emailResult = await readJsonResponse<{
          message?: string;
          status?: EmailProductionStatusRow;
          testRecipient?: string;
        }>(emailResponse);

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
        if (!guaranteesResponse.ok) {
          throw new Error(
            guaranteesResult.message ?? 'Không thể tải danh sách GM.',
          );
        }
        if (!remindersResponse.ok) {
          throw new Error(
            remindersResult.message ?? 'Không thể tải lịch nhắc đối soát.',
          );
        }
        if (!emailResponse.ok) {
          throw new Error(
            emailResult.message ?? 'Không thể tải cấu hình email.',
          );
        }

        if (!cancelled) {
          if (isSuperAdmin) {
            setManagedAccounts(result.accounts ?? []);
            setAccountMessage('');
            setAccountState('idle');
          }
          const nextCustomers = result.customers ?? [];
          setCustomers(nextCustomers);
          setSelectedClient((currentClient) =>
            nextCustomers.some((client) => client.id === currentClient)
              ? currentClient
              : (nextCustomers[0]?.id ?? ''),
          );
          setGuaranteeClientId((currentClient) =>
            nextCustomers.some((client) => client.id === currentClient)
              ? currentClient
              : (nextCustomers[0]?.id ?? ''),
          );
          setOverview(
            overviewResult.overview ?? emptyAdminOverviewData(selectedPeriod),
          );
          setStatementRows(statementsResult.statements ?? []);
          setActivityRows(activityResult.activity ?? []);
          setGuarantees(guaranteesResult.guarantees ?? []);
          setReminderRecipients(remindersResult.recipients ?? []);
          setReminderRuns(remindersResult.runs ?? []);
          setEmailStatus(emailResult.status ?? null);
          setEmailTestTo(
            (currentValue) =>
              currentValue || emailResult.testRecipient || userEmail,
          );
          setEmailState('idle');
          setEmailMessage('');
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
  }, [isSuperAdmin, selectedPeriod, userEmail]);

  async function refreshAdminSnapshot(period = selectedPeriod) {
    const [
      customersResponse,
      overviewResponse,
      statementsResponse,
      activityResponse,
      guaranteesResponse,
      remindersResponse,
      emailResponse,
    ] = await Promise.all([
      fetchWithSession('/api/admin/customers'),
      fetchWithSession(
        `/api/admin/overview?period=${encodeURIComponent(period)}`,
      ),
      fetchWithSession(
        `/api/admin/statements?period=${encodeURIComponent(period)}`,
      ),
      fetchWithSession('/api/admin/activity?limit=12'),
      fetchWithSession('/api/admin/guarantees'),
      fetchWithSession(
        `/api/admin/reminders?period=${encodeURIComponent(period)}`,
      ),
      fetchWithSession('/api/admin/email'),
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
    const guaranteesResult = await readJsonResponse<{
      guarantees?: TrackGuaranteeRow[];
      message?: string;
    }>(guaranteesResponse);
    const remindersResult = await readJsonResponse<{
      message?: string;
      recipients?: ReminderRecipientRow[];
      runs?: ReminderRunRow[];
    }>(remindersResponse);
    const emailResult = await readJsonResponse<{
      message?: string;
      status?: EmailProductionStatusRow;
      testRecipient?: string;
    }>(emailResponse);

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
    if (!guaranteesResponse.ok) {
      throw new Error(
        guaranteesResult.message ?? 'Không thể tải lại danh sách GM.',
      );
    }
    if (!remindersResponse.ok) {
      throw new Error(
        remindersResult.message ?? 'Không thể tải lại lịch nhắc đối soát.',
      );
    }
    if (!emailResponse.ok) {
      throw new Error(
        emailResult.message ?? 'Không thể tải lại cấu hình email.',
      );
    }

    const nextCustomers = customersResult.customers ?? [];
    setCustomers(nextCustomers);
    setSelectedClient((currentClient) =>
      nextCustomers.some((client) => client.id === currentClient)
        ? currentClient
        : (nextCustomers[0]?.id ?? ''),
    );
    setGuaranteeClientId((currentClient) =>
      nextCustomers.some((client) => client.id === currentClient)
        ? currentClient
        : (nextCustomers[0]?.id ?? ''),
    );
    setOverview(overviewResult.overview ?? emptyAdminOverviewData(period));
    setStatementRows(statementsResult.statements ?? []);
    setActivityRows(activityResult.activity ?? []);
    setGuarantees(guaranteesResult.guarantees ?? []);
    setReminderRecipients(remindersResult.recipients ?? []);
    setReminderRuns(remindersResult.runs ?? []);
    setEmailStatus(emailResult.status ?? null);
    setEmailTestTo(
      (currentValue) => currentValue || emailResult.testRecipient || userEmail,
    );
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
      await refreshAdminSnapshot(selectedPeriod);
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
      await refreshAdminSnapshot(selectedPeriod);
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
    if (uploadMode === 'single' && !activeClient) {
      setUploadState('failed');
      setUploadMessage('Cần tạo khách hàng trước khi upload statement.');
      return;
    }

    if (!selectedFile || validation.state !== 'ready') return;

    setUploadState('uploading');
    setUploadMessage('');

    const body = new FormData();
    body.append('file', selectedFile);
    body.append('uploadMode', uploadMode);
    if (uploadMode === 'single' && activeClient) {
      body.append('clientId', activeClient.id);
    }
    body.append('period', selectedPeriod);

    try {
      const response = await fetchWithSession('/api/admin/uploads', {
        method: 'POST',
        body,
      });
      const result = await readJsonResponse<{
        customer?: {
          latestPeriod: string | null;
          totalRevenue: number;
          uploadedQuarters: number;
        };
        importedClients?: number;
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Upload bị từ chối (${response.status}).`,
        );
      }

      setUploadState('stored');
      if (uploadMode === 'single' && result.customer && activeClient) {
        setCustomers((currentCustomers) =>
          currentCustomers.map((customer) =>
            customer.id === activeClient.id
              ? {
                  ...customer,
                  latestPeriod:
                    result.customer?.latestPeriod ?? customer.latestPeriod,
                  totalRevenue:
                    result.customer?.totalRevenue ?? customer.totalRevenue,
                  uploadedQuarters:
                    result.customer?.uploadedQuarters ??
                    customer.uploadedQuarters,
                }
              : customer,
          ),
        );
      }
      setUploadMessage(result.message ?? 'Đã lưu file.');
      await refreshAdminSnapshot(selectedPeriod);
    } catch (error) {
      setUploadState('failed');
      setUploadMessage(
        error instanceof Error
          ? error.message
          : 'Không thể upload file ở thời điểm này.',
      );
    }
  }

  async function createTrackGuarantee(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (guaranteeState === 'saving') return;

    const amount = parseVndInput(guaranteeAmount);
    if (!activeGuaranteeClient) {
      setGuaranteeState('failed');
      setGuaranteeMessage('Cần tạo khách hàng trước khi tạo GM.');
      return;
    }
    if (!guaranteeTrackTitle.trim()) {
      setGuaranteeState('failed');
      setGuaranteeMessage('Cần nhập tên bài hát.');
      return;
    }
    if (!amount || amount <= 0) {
      setGuaranteeState('failed');
      setGuaranteeMessage('Số tiền GM phải lớn hơn 0 VNĐ.');
      return;
    }

    setGuaranteeState('saving');
    setGuaranteeMessage('');

    try {
      const response = await fetchWithSession('/api/admin/guarantees', {
        body: JSON.stringify({
          amount,
          clientId: activeGuaranteeClient.id,
          notes: guaranteeNotes,
          trackExternalId: guaranteeTrackExternalId,
          trackTitle: guaranteeTrackTitle,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const result = await readJsonResponse<{
        guarantees?: TrackGuaranteeRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể tạo GM (${response.status}).`,
        );
      }

      setGuarantees(result.guarantees ?? []);
      setGuaranteeTrackExternalId('');
      setGuaranteeTrackTitle('');
      setGuaranteeAmount('');
      setGuaranteeNotes('');
      setGuaranteeMessage(result.message ?? 'Đã tạo GM.');
      setGuaranteeState('saved');
      await refreshAdminSnapshot(selectedPeriod);
    } catch (error) {
      setGuaranteeMessage(
        error instanceof Error
          ? error.message
          : 'Không thể tạo GM ở thời điểm này.',
      );
      setGuaranteeState('failed');
    }
  }

  async function updateTrackGuarantee(
    guarantee: TrackGuaranteeRow,
    action: 'archive' | 'reactivate',
  ) {
    if (activeGuaranteeActionId) return;

    setActiveGuaranteeActionId(guarantee.id);
    setGuaranteeState('idle');
    setGuaranteeMessage('');

    try {
      const response = await fetchWithSession('/api/admin/guarantees', {
        body: JSON.stringify({
          action,
          guaranteeId: guarantee.id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const result = await readJsonResponse<{
        guarantees?: TrackGuaranteeRow[];
        message?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể cập nhật GM (${response.status}).`,
        );
      }

      setGuarantees(result.guarantees ?? []);
      setGuaranteeMessage(result.message ?? 'Đã cập nhật GM.');
      setGuaranteeState('saved');
      await refreshAdminSnapshot(selectedPeriod);
    } catch (error) {
      setGuaranteeMessage(
        error instanceof Error
          ? error.message
          : 'Không thể cập nhật GM ở thời điểm này.',
      );
      setGuaranteeState('failed');
    } finally {
      setActiveGuaranteeActionId('');
    }
  }

  async function runSettlementReminderAction(
    action: 'dry_run' | 'send' | 'retry_failed',
    retryRunId?: string,
  ) {
    if (reminderState === 'saving') return;

    setReminderState('saving');
    setReminderMessage('');

    try {
      const response = await fetchWithSession('/api/admin/reminders', {
        body: JSON.stringify({
          action,
          period: selectedPeriod,
          retryRunId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const result = await readJsonResponse<{
        message?: string;
        recipients?: ReminderRecipientRow[];
        runs?: ReminderRunRow[];
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể chạy reminder (${response.status}).`,
        );
      }

      setReminderRecipients(result.recipients ?? []);
      setReminderRuns(result.runs ?? []);
      setReminderMessage(result.message ?? 'Đã chạy reminder.');
      setReminderState('saved');
      await refreshAdminSnapshot(selectedPeriod);
    } catch (error) {
      setReminderMessage(
        error instanceof Error
          ? error.message
          : 'Không thể chạy reminder ở thời điểm này.',
      );
      setReminderState('failed');
    }
  }

  async function sendEmailProductionTest() {
    if (emailState === 'saving') return;

    setEmailState('saving');
    setEmailMessage('');

    try {
      const response = await fetchWithSession('/api/admin/email', {
        body: JSON.stringify({
          action: 'send_test',
          to: emailTestTo,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const result = await readJsonResponse<{
        message?: string;
        status?: EmailProductionStatusRow;
      }>(response);

      if (!response.ok) {
        throw new Error(
          result.message ?? `Không thể gửi email test (${response.status}).`,
        );
      }

      setEmailStatus(result.status ?? null);
      setEmailMessage(result.message ?? 'Đã gửi email test.');
      setEmailState('saved');
      await refreshAdminSnapshot(selectedPeriod);
    } catch (error) {
      setEmailMessage(
        error instanceof Error
          ? error.message
          : 'Không thể gửi email test ở thời điểm này.',
      );
      setEmailState('failed');
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
      await refreshAdminSnapshot(selectedPeriod);
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
      await refreshAdminSnapshot(selectedPeriod);
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
      await refreshAdminSnapshot(selectedPeriod);
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
      await refreshAdminSnapshot(selectedPeriod);
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
      await refreshAdminSnapshot(selectedPeriod);
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
    setUploadMode('single');
    setSelectedClient(statement.clientId);
    setSelectedPeriod(statement.period);
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
        <ConsoleRail
          activeItem={activeAdminTab}
          items={adminRailItems}
          onSelect={(itemId) => {
            if (adminTabs.has(itemId as AdminTab)) {
              setActiveAdminTab(itemId as AdminTab);
            }
          }}
          variant="admin"
        />

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
            {isInitialLoading ? (
              <section className="music-card flex min-h-[420px] items-center justify-center p-6 text-center">
                <div>
                  <RefreshCw className="mx-auto size-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm font-semibold">
                    Đang tải dashboard admin
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Hệ thống đang đọc dữ liệu khách hàng, statement và GM.
                  </p>
                </div>
              </section>
            ) : null}
            <Tabs
              className={isInitialLoading ? 'hidden' : 'min-w-0 space-y-5'}
              onValueChange={(value) => {
                if (adminTabs.has(value as AdminTab)) {
                  setActiveAdminTab(value as AdminTab);
                }
              }}
              value={activeAdminTab}
            >
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
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="guarantees"
                  >
                    <WalletCards className="size-4" />
                    GM
                  </TabsTrigger>
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="reminders"
                  >
                    <BellRing className="size-4" />
                    Nhắc lịch
                  </TabsTrigger>
                  <TabsTrigger
                    className="h-9 min-w-[112px] flex-none gap-2 px-3 py-0 leading-none after:hidden data-active:bg-[#e9fffb] data-active:shadow-none"
                    value="email"
                  >
                    <Mail className="size-4" />
                    Email
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
                      if (value) setSelectedPeriod(value);
                    }}
                    value={selectedPeriod}
                  >
                    <SelectTrigger
                      aria-label="Quý dashboard admin"
                      className="music-control h-10 w-full bg-white"
                    >
                      <span className="flex-1 truncate text-left">
                        {selectedPeriodLabel}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {adminQuarterOptions.map((period) => (
                        <SelectItem key={period.value} value={period.value}>
                          {period.label}
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
                          {overview.periodLabel}
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
                            {formatNumber(uploadedQuarterCount)}
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
                            {formatMoney(totalRevenue)}
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
                          <p className="text-white/55">Quarter</p>
                          <p className="mt-1 truncate text-lg font-semibold">
                            {overview.periodLabel}
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
                    <AdminRevenueTrendChart data={overview.quarterlyTrend} />
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Customer ranking
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Top khách hàng quý này
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
                          <TableHead>Quarters</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleCustomers.length > 0 ? (
                          customerPage.visibleRows.map((client) => (
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
                                {formatNumber(client.uploadedQuarters)}
                              </TableCell>
                              <TableCell>
                                <span className="block">
                                  {formatMoney(client.totalRevenue)}
                                </span>
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
                    <TablePagination {...customerPage} itemLabel="khách hàng" />
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
                              {accountPage.visibleRows.map((account) => (
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
                          <TablePagination
                            {...accountPage}
                            itemLabel="tài khoản"
                          />
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
                        Upload dữ liệu quý
                      </h2>
                      <FileSpreadsheet className="size-6 text-primary" />
                    </div>

                    <div className="mt-5 grid gap-3">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            File tổng nhiều khách hàng
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            Bật khi Excel có cột Mã khách hàng/Client ID. Ngưỡng
                            thanh toán {formatMoney(SETTLEMENT_THRESHOLD_VND)}.
                          </span>
                        </span>
                        <input
                          aria-label="File tổng nhiều khách hàng"
                          checked={uploadMode === 'bulk'}
                          className="size-5 accent-primary"
                          onChange={(event) => {
                            setUploadMode(
                              event.target.checked ? 'bulk' : 'single',
                            );
                            setUploadState('idle');
                            setUploadMessage('');
                          }}
                          type="checkbox"
                        />
                      </label>

                      <div className="space-y-2">
                        {uploadMode === 'single' ? (
                          <>
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
                          </>
                        ) : (
                          <div className="rounded-lg border border-[#bce9e4] bg-[#f0fffc] px-3 py-3 text-sm leading-6 text-[#047a70]">
                            Hệ thống sẽ tự match từng dòng theo mã khách hàng đã
                            có trong mục Tài khoản/Khách hàng.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <span className="block text-sm font-medium">
                          Quý dữ liệu
                        </span>
                        <Select
                          onValueChange={(value) => {
                            if (value) setSelectedPeriod(value);
                          }}
                          value={selectedPeriod}
                        >
                          <SelectTrigger
                            aria-label="Quý dữ liệu"
                            className="music-control h-10 w-full"
                          >
                            <span className="flex-1 truncate text-left">
                              {selectedPeriodLabel}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {adminQuarterOptions.map((period) => (
                              <SelectItem
                                key={period.value}
                                value={period.value}
                              >
                                {period.label}
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
                      {uploadState === 'uploading'
                        ? 'Đang lưu...'
                        : uploadMode === 'bulk'
                          ? 'Import file tổng'
                          : 'Lưu file'}
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
                          <TableHead>GM</TableHead>
                          <TableHead>Carry</TableHead>
                          <TableHead>Đối soát</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleStatementRows.length > 0 ? (
                          statementPage.visibleRows.map((statement) => (
                            <TableRow key={statement.reportPeriodId}>
                              <TableCell className="font-medium">
                                <span className="block">
                                  {statement.clientName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {statement.clientCode}
                                </span>
                              </TableCell>
                              <TableCell>{statement.periodLabel}</TableCell>
                              <TableCell>
                                {formatNumber(statement.rowCount)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(statement.units)}
                              </TableCell>
                              <TableCell>
                                {formatMoney(statement.revenue)}
                              </TableCell>
                              <TableCell>
                                {statement.costs > 0
                                  ? formatMoney(statement.costs)
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                {formatMoney(statement.carryForward)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={settlementBadgeClass(
                                    statement.settlementStatus,
                                  )}
                                  variant="secondary"
                                >
                                  {settlementStatusLabel(
                                    statement.settlementStatus,
                                  )}
                                </Badge>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {settlementHelper(statement)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge className="rounded-lg" variant="outline">
                                  {statementStatusLabel(statement.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  <a
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-sm font-medium transition-colors hover:bg-muted"
                                    href={adminStatementExportUrl(
                                      statement.reportPeriodId,
                                      'pdf',
                                    )}
                                  >
                                    <Download className="size-4" />
                                    PDF
                                  </a>
                                  <a
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-sm font-medium transition-colors hover:bg-muted"
                                    href={adminStatementExportUrl(
                                      statement.reportPeriodId,
                                      'excel',
                                    )}
                                  >
                                    <FileSpreadsheet className="size-4" />
                                    Excel
                                  </a>
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
                              colSpan={10}
                            >
                              {statementRows.length > 0
                                ? 'Không có statement khớp bộ lọc.'
                                : 'Chưa có statement trong quý đang chọn.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <TablePagination {...statementPage} itemLabel="statement" />
                  </section>
                </section>
                <ActivityLogPanel activityRows={activityRows} />
              </TabsContent>

              <TabsContent className="space-y-5" value="guarantees">
                <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  <section className="music-card p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Guaranteed Minimum
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Tạo GM theo bài hát
                        </h2>
                      </div>
                      <Music2 className="size-6 text-primary" />
                    </div>

                    <form
                      className="mt-5 space-y-3"
                      onSubmit={createTrackGuarantee}
                    >
                      <div className="space-y-2">
                        <span className="block text-sm font-medium">
                          Khách hàng
                        </span>
                        <Select
                          onValueChange={(value) => {
                            if (value) setGuaranteeClientId(value);
                          }}
                          value={guaranteeClientId}
                        >
                          <SelectTrigger
                            aria-label="Khách hàng nhận GM"
                            className="music-control h-10 w-full"
                          >
                            <span className="flex-1 truncate text-left">
                              {activeGuaranteeClient?.name ?? 'Chọn khách hàng'}
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
                        <span
                          className="block text-sm font-medium"
                          id="guarantee-track-label"
                        >
                          Bài hát
                        </span>
                        <Input
                          aria-labelledby="guarantee-track-label"
                          onChange={(event) =>
                            setGuaranteeTrackTitle(event.target.value)
                          }
                          placeholder="Tên bài hát"
                          value={guaranteeTrackTitle}
                        />
                      </div>

                      <div className="space-y-2">
                        <span
                          className="block text-sm font-medium"
                          id="guarantee-track-id-label"
                        >
                          ID bài hát
                        </span>
                        <Input
                          aria-labelledby="guarantee-track-id-label"
                          onChange={(event) =>
                            setGuaranteeTrackExternalId(event.target.value)
                          }
                          placeholder="ISRC / Track ID"
                          value={guaranteeTrackExternalId}
                        />
                      </div>

                      <div className="space-y-2">
                        <span
                          className="block text-sm font-medium"
                          id="guarantee-amount-label"
                        >
                          Số tiền GM
                        </span>
                        <Input
                          aria-labelledby="guarantee-amount-label"
                          inputMode="numeric"
                          onChange={(event) =>
                            setGuaranteeAmount(event.target.value)
                          }
                          placeholder="100000000"
                          value={guaranteeAmount}
                        />
                      </div>

                      <div className="space-y-2">
                        <span
                          className="block text-sm font-medium"
                          id="guarantee-notes-label"
                        >
                          Ghi chú
                        </span>
                        <Input
                          aria-labelledby="guarantee-notes-label"
                          onChange={(event) =>
                            setGuaranteeNotes(event.target.value)
                          }
                          placeholder="GM advance"
                          value={guaranteeNotes}
                        />
                      </div>

                      <Button
                        className="h-10 w-full bg-[#071118] text-white hover:bg-[#111827]"
                        disabled={guaranteeState === 'saving'}
                        type="submit"
                      >
                        <WalletCards className="size-4" />
                        {guaranteeState === 'saving' ? 'Đang lưu...' : 'Tạo GM'}
                      </Button>
                    </form>

                    {guaranteeMessage ? (
                      <p
                        className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                          guaranteeState === 'failed'
                            ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                            : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                        }`}
                      >
                        {guaranteeMessage}
                      </p>
                    ) : null}
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          GM ledger
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Theo dõi recoup
                        </h2>
                      </div>
                      <Badge className="rounded-lg bg-[#e7fbf7] text-[#00796f]">
                        {formatNumber(activeGuaranteeCount)} active
                      </Badge>
                    </div>

                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Balance
                        </p>
                        <p className="font-display mt-2 truncate text-xl font-semibold">
                          {formatMoney(totalGuaranteeBalance)}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Recouped
                        </p>
                        <p className="font-display mt-2 truncate text-xl font-semibold">
                          {formatMoney(totalGuaranteeRecouped)}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          GM Count
                        </p>
                        <p className="font-display mt-2 text-xl font-semibold">
                          {formatNumber(guarantees.length)}
                        </p>
                      </div>
                    </div>

                    <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="relative block">
                        <span className="sr-only">Tìm GM</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          aria-label="Tìm GM"
                          className="pl-9"
                          onChange={(event) =>
                            setGuaranteeSearch(event.target.value)
                          }
                          placeholder="Tìm client, bài hát, ID..."
                          value={guaranteeSearch}
                        />
                      </div>
                      <Select
                        onValueChange={(value) => {
                          if (
                            value === 'all' ||
                            value === 'active' ||
                            value === 'recouped' ||
                            value === 'archived'
                          ) {
                            setGuaranteeStatusFilter(value);
                          }
                        }}
                        value={guaranteeStatusFilter}
                      >
                        <SelectTrigger
                          aria-label="Lọc trạng thái GM"
                          className="music-control h-10 w-full bg-white"
                        >
                          <span className="flex-1 truncate text-left">
                            {guaranteeStatusFilterLabel(guaranteeStatusFilter)}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả GM</SelectItem>
                          <SelectItem value="active">Đang trừ GM</SelectItem>
                          <SelectItem value="recouped">Đã recoup</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Track</TableHead>
                            <TableHead>GM</TableHead>
                            <TableHead>Đã trừ</TableHead>
                            <TableHead>Còn lại</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleGuarantees.length > 0 ? (
                            guaranteePage.visibleRows.map((guarantee) => (
                              <TableRow key={guarantee.id}>
                                <TableCell className="font-medium">
                                  <span className="block">
                                    {guarantee.clientName}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {guarantee.clientCode}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="block font-medium">
                                    {guarantee.trackTitle}
                                  </span>
                                  {guarantee.trackExternalId ? (
                                    <span className="block text-xs text-muted-foreground">
                                      ID: {guarantee.trackExternalId}
                                    </span>
                                  ) : null}
                                  {guarantee.notes ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {guarantee.notes}
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
                                  <Badge
                                    className={guaranteeBadgeClass(
                                      guarantee.status,
                                    )}
                                    variant="secondary"
                                  >
                                    {guaranteeStatusLabel(guarantee.status)}
                                  </Badge>
                                  {guarantee.lastRecoupedPeriod ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {guarantee.lastRecoupedPeriod}
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  {guarantee.status === 'archived' ? (
                                    <Button
                                      className="h-9"
                                      disabled={
                                        activeGuaranteeActionId === guarantee.id
                                      }
                                      onClick={() => {
                                        void updateTrackGuarantee(
                                          guarantee,
                                          'reactivate',
                                        );
                                      }}
                                      type="button"
                                      variant="outline"
                                    >
                                      <RefreshCw className="size-4" />
                                      Reactivate
                                    </Button>
                                  ) : (
                                    <Button
                                      className="h-9"
                                      disabled={
                                        activeGuaranteeActionId === guarantee.id
                                      }
                                      onClick={() => {
                                        void updateTrackGuarantee(
                                          guarantee,
                                          'archive',
                                        );
                                      }}
                                      type="button"
                                      variant="outline"
                                    >
                                      <Archive className="size-4" />
                                      Archive
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                className="h-24 text-center text-sm text-muted-foreground"
                                colSpan={7}
                              >
                                {guarantees.length > 0
                                  ? 'Không có GM khớp bộ lọc.'
                                  : 'Chưa có GM.'}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      <TablePagination {...guaranteePage} itemLabel="GM" />
                    </div>
                  </section>
                </section>

                <ActivityLogPanel activityRows={activityRows} />
              </TabsContent>

              <TabsContent className="space-y-5" value="reminders">
                <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  <section className="music-card p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Settlement reminder
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Nhắc đối soát ngày 15
                        </h2>
                      </div>
                      <BellRing className="size-6 text-primary" />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Kỳ
                        </p>
                        <p className="font-display mt-2 text-xl font-semibold">
                          {selectedPeriodLabel}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Có thể gửi
                        </p>
                        <p className="font-display mt-2 text-xl font-semibold">
                          {formatNumber(sendableReminderCount)}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Chưa có statement
                        </p>
                        <p className="font-display mt-2 text-xl font-semibold">
                          {formatNumber(missingReminderCount)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-2">
                      <Button
                        className="h-10 justify-center"
                        disabled={reminderState === 'saving'}
                        onClick={() => {
                          void runSettlementReminderAction('dry_run');
                        }}
                        type="button"
                        variant="outline"
                      >
                        <EyeOff className="size-4" />
                        Dry-run
                      </Button>
                      <Button
                        className="h-10 justify-center bg-[#071118] text-white hover:bg-[#111827]"
                        disabled={
                          reminderState === 'saving' ||
                          sendableReminderCount === 0
                        }
                        onClick={() => {
                          void runSettlementReminderAction('send');
                        }}
                        type="button"
                      >
                        <Send className="size-4" />
                        Gửi ngay
                      </Button>
                      <Button
                        className="h-10 justify-center"
                        disabled={
                          reminderState === 'saving' ||
                          !latestRetryableReminderRun
                        }
                        onClick={() => {
                          if (latestRetryableReminderRun) {
                            void runSettlementReminderAction(
                              'retry_failed',
                              latestRetryableReminderRun.id,
                            );
                          }
                        }}
                        type="button"
                        variant="outline"
                      >
                        <RefreshCw className="size-4" />
                        Retry lỗi
                      </Button>
                    </div>

                    {reminderMessage ? (
                      <p
                        className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                          reminderState === 'failed'
                            ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                            : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                        }`}
                      >
                        {reminderMessage}
                      </p>
                    ) : null}

                    <div className="mt-5 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          Cron Cloudflare
                        </span>
                        <span className="font-medium">
                          09:00 ngày 15 hằng tháng
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Recipient preview
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Danh sách nhận email
                        </h2>
                      </div>
                      <Badge className="rounded-lg bg-[#e7fbf7] text-[#00796f]">
                        {formatNumber(reminderRecipients.length)} accounts
                      </Badge>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Statement</TableHead>
                            <TableHead>Payable</TableHead>
                            <TableHead>Settlement</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reminderRecipients.length > 0 ? (
                            reminderRecipientPage.visibleRows.map(
                              (recipient) => (
                                <TableRow
                                  key={`${recipient.clientId}:${recipient.userId}`}
                                >
                                  <TableCell className="font-medium">
                                    <span className="block">
                                      {recipient.clientName}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {recipient.clientCode}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="block">
                                      {recipient.email}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {accessLevelLabel(recipient.accessLevel)}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className={reminderStatementClass(
                                        recipient.statementStatus,
                                      )}
                                      variant="secondary"
                                    >
                                      {reminderStatementLabel(
                                        recipient.statementStatus,
                                      )}
                                    </Badge>
                                    {recipient.latestPublishedAt ? (
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        {formatAccountDate(
                                          recipient.latestPublishedAt,
                                        )}
                                      </span>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>
                                    {formatMoney(recipient.payable)}
                                  </TableCell>
                                  <TableCell>
                                    <span className="block font-medium">
                                      {reminderSettlementLabel(
                                        recipient.settlementStatus,
                                      )}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {recipient.settlementStatus === 'paid'
                                        ? formatMoney(recipient.paidAmount)
                                        : formatMoney(recipient.carryForward)}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ),
                            )
                          ) : (
                            <TableRow>
                              <TableCell
                                className="h-24 text-center text-sm text-muted-foreground"
                                colSpan={5}
                              >
                                Chưa có tài khoản client active.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      <TablePagination
                        {...reminderRecipientPage}
                        itemLabel="tài khoản"
                      />
                    </div>
                  </section>
                </section>

                <section className="music-card p-4 md:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Send log
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">
                        Lịch sử reminder
                      </h2>
                    </div>
                    <Mail className="size-5 text-primary" />
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Kỳ</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Sent</TableHead>
                          <TableHead>Failed</TableHead>
                          <TableHead>Missing config</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reminderRuns.length > 0 ? (
                          reminderRunPage.visibleRows.map((run) => (
                            <TableRow key={run.id}>
                              <TableCell>
                                {formatAccountDate(run.createdAt)}
                              </TableCell>
                              <TableCell>
                                {reminderRunTypeLabel(run.runType)}
                              </TableCell>
                              <TableCell>{run.periodLabel}</TableCell>
                              <TableCell>
                                <Badge
                                  className={reminderRunStatusClass(run.status)}
                                  variant="secondary"
                                >
                                  {reminderRunStatusLabel(run.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {formatNumber(run.targetCount)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(run.sentCount)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(run.failedCount)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(run.notConfiguredCount)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              className="h-24 text-center text-sm text-muted-foreground"
                              colSpan={8}
                            >
                              Chưa có lịch sử reminder.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <TablePagination {...reminderRunPage} itemLabel="lần gửi" />
                  </div>
                </section>

                <ActivityLogPanel activityRows={activityRows} />
              </TabsContent>

              <TabsContent className="space-y-5" value="email">
                <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  <section className="music-card p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Email production
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Trạng thái gửi mail
                        </h2>
                      </div>
                      {emailStatus?.productionReady ? (
                        <CheckCircle2 className="size-6 text-[#00796f]" />
                      ) : (
                        <AlertTriangle className="size-6 text-[#986200]" />
                      )}
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Production
                          </span>
                          <Badge
                            className={emailReadyClass(
                              Boolean(emailStatus?.productionReady),
                            )}
                            variant="secondary"
                          >
                            {emailReadyLabel(
                              Boolean(emailStatus?.productionReady),
                            )}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {emailStatus?.portalUrl ??
                            'https://artistportal.zuongzeroent.com'}
                        </p>
                      </div>

                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          From
                        </p>
                        <p className="mt-2 truncate text-sm font-medium">
                          {emailStatus?.fromAddress ?? 'Chưa cấu hình'}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {emailStatus?.fromDomain ?? '-'}
                        </p>
                      </div>

                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Resend API
                          </span>
                          <Badge
                            className={emailReadyClass(
                              Boolean(emailStatus?.apiKeyConfigured),
                            )}
                            variant="secondary"
                          >
                            {emailStatus?.apiKeyConfigured
                              ? 'Configured'
                              : 'Missing'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2">
                      <span className="block text-sm font-medium">
                        Gửi email test
                      </span>
                      <Input
                        onChange={(event) => setEmailTestTo(event.target.value)}
                        placeholder="name@company.com"
                        type="email"
                        value={emailTestTo}
                      />
                      <Button
                        className="h-10 w-full bg-[#071118] text-white hover:bg-[#111827]"
                        disabled={emailState === 'saving'}
                        onClick={() => {
                          void sendEmailProductionTest();
                        }}
                        type="button"
                      >
                        <Mail className="size-4" />
                        {emailState === 'saving' ? 'Đang gửi...' : 'Gửi test'}
                      </Button>
                    </div>

                    {emailMessage ? (
                      <p
                        className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                          emailState === 'failed'
                            ? 'border-[#f0b7b2] bg-[#fff2f0] text-[#a53a30]'
                            : 'border-[#bce9e4] bg-[#f0fffc] text-[#047a70]'
                        }`}
                      >
                        {emailMessage}
                      </p>
                    ) : null}
                  </section>

                  <section className="music-card p-4 md:p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Domain health
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                          Resend, SPF/DKIM/DMARC
                        </h2>
                      </div>
                      <Badge
                        className={emailReadyClass(
                          Boolean(emailStatus?.sendingReady),
                        )}
                        variant="secondary"
                      >
                        {emailStatus?.sendingReady
                          ? 'Sending ready'
                          : 'Check needed'}
                      </Badge>
                    </div>

                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Resend domain
                        </p>
                        <p className="mt-2 truncate text-sm font-medium">
                          {emailStatus?.resendDomain?.name ?? '-'}
                        </p>
                        <Badge
                          className={emailRecordStatusClass(
                            emailStatus?.resendDomain?.status ?? 'unknown',
                          )}
                          variant="secondary"
                        >
                          {emailRecordStatusLabel(
                            emailStatus?.resendDomain?.status ?? 'unknown',
                          )}
                        </Badge>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Sending
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {emailStatus?.resendDomain?.sending ?? '-'}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          DMARC
                        </p>
                        <Badge
                          className={emailRecordStatusClass(
                            emailStatus?.dmarc.status === 'present'
                              ? 'verified'
                              : emailStatus?.dmarc.status === 'missing'
                                ? 'failed'
                                : 'unknown',
                          )}
                          variant="secondary"
                        >
                          {dmarcStatusLabel(
                            emailStatus?.dmarc.status ?? 'unknown',
                          )}
                        </Badge>
                      </div>
                    </div>

                    {emailStatus?.issues.length ? (
                      <div className="mb-4 grid gap-2">
                        {emailStatus.issues.map((issue) => (
                          <div
                            className="rounded-lg border border-[#f4ddb1] bg-[#fffaf0] px-3 py-2 text-sm text-[#7a5200]"
                            key={issue}
                          >
                            {issue}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="overflow-hidden rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Record</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {emailDnsRecords.length > 0 ? (
                            emailDnsRecords.map((record, index) => (
                              <TableRow
                                key={`${record.record}:${record.name}:${index}`}
                              >
                                <TableCell className="font-medium">
                                  {record.record || '-'}
                                </TableCell>
                                <TableCell className="max-w-[280px] truncate">
                                  {record.name || '-'}
                                </TableCell>
                                <TableCell>{record.type || '-'}</TableCell>
                                <TableCell>
                                  <Badge
                                    className={emailRecordStatusClass(
                                      record.status,
                                    )}
                                    variant="secondary"
                                  >
                                    {emailRecordStatusLabel(record.status)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                className="h-24 text-center text-sm text-muted-foreground"
                                colSpan={4}
                              >
                                Chưa đọc được DNS records từ Resend.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
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
  const activityPage = usePaginatedRows(activityRows);

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
              activityPage.visibleRows.map((row) => (
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
        <TablePagination {...activityPage} itemLabel="hoạt động" />
      </div>
    </section>
  );
}

function AdminRevenueTrendChart({
  data,
}: {
  data: AdminOverviewData['quarterlyTrend'];
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

  const maxRevenue = Math.max(...data.map((point) => point.vnd), 1);

  return (
    <div className="grid min-h-[310px] grid-cols-[48px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col justify-between border-r border-border pr-2 text-right text-xs text-muted-foreground">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="flex min-w-0 items-end gap-3 overflow-visible pb-3">
        {data.map((point, index) => {
          const tooltip = `${point.label}: ${formatMoney(point.vnd)} / ${formatNumber(point.units)} units`;

          return (
            <div
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              key={point.period}
            >
              <div className="flex h-[230px] w-full items-end border-b border-border">
                <div
                  aria-label={`${point.label}: ${formatMoney(point.vnd)}`}
                  className="group relative flex h-full w-full items-end"
                  title={tooltip}
                >
                  <ChartHoverTooltip
                    label={point.label}
                    meta={`${formatNumber(point.units)} units`}
                    value={formatMoney(point.vnd)}
                  />
                  <div
                    className="w-full rounded-t-md transition-opacity group-hover:opacity-85"
                    style={{
                      backgroundColor:
                        adminPalette[index % adminPalette.length],
                      height: `${Math.max(4, (point.vnd / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="w-full truncate text-center text-xs text-muted-foreground">
                {point.label.replace('202', "'2")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopCustomerList({
  customers,
}: {
  customers: AdminOverviewData['topCustomers'];
}) {
  const customerPage = usePaginatedRows(customers);

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

  const maxRevenue = Math.max(...customers.map((customer) => customer.vnd), 1);

  return (
    <div className="grid gap-3">
      {customerPage.visibleRows.map((customer, index) => (
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
              #{(customerPage.page - 1) * customerPage.pageSize + index + 1}
            </Badge>
          </div>
          <div
            className="group relative mt-3 h-2 rounded-full bg-muted"
            title={`${customer.clientName}: ${formatMoney(customer.vnd)} / ${formatNumber(customer.units)} units`}
          >
            <ChartHoverTooltip
              label={customer.clientName}
              meta={`${formatNumber(customer.units)} units / ${formatNumber(customer.rowCount)} rows`}
              value={formatMoney(customer.vnd)}
            />
            <div
              className="h-full rounded-full bg-[#00b8a9]"
              style={{
                width: `${Math.max(5, (customer.vnd / maxRevenue) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{formatMoney(customer.vnd)}</span>
            <span className="text-muted-foreground">
              {formatNumber(customer.units)} units
            </span>
          </div>
        </div>
      ))}
      <TablePagination {...customerPage} itemLabel="khách hàng" />
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
  const itemPage = usePaginatedRows(items);

  return (
    <section className="music-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {icon}
      </div>
      {items.length > 0 ? (
        <div className="grid gap-3">
          {itemPage.visibleRows.map((item, index) => (
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
                {formatMoney(item.vnd)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(item.units)} units /{' '}
                {formatNumber(item.clientCount)} clients
              </p>
            </div>
          ))}
          <TablePagination {...itemPage} itemLabel="dòng" />
        </div>
      ) : (
        <div className="flex min-h-[190px] items-center justify-center rounded-lg border border-dashed border-border bg-white text-center">
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        </div>
      )}
    </section>
  );
}
