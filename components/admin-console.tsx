'use client';

import { useEffect, useMemo, useState } from 'react';
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
  UserPlus,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const roleRows = [
  {
    role: 'Owner / Super admin',
    scope: 'Cấu hình và tài khoản',
    permissions:
      'Tạo tài khoản quản lý, gán khách hàng, khóa hoặc mở quyền truy cập.',
  },
  {
    role: 'Quản lý / Admin',
    scope: 'Admin console',
    permissions:
      'Quản lý khách hàng, upload Excel, validate, publish statement. Không tạo tài khoản.',
  },
  {
    role: 'Client finance',
    scope: 'Client portal',
    permissions: 'Xem dashboard và statement của client được gán.',
  },
  {
    role: 'Auditor',
    scope: 'Audit view',
    permissions: 'Xem log và trạng thái đối soát, không upload hoặc publish.',
  },
];

type AccessRequestRow = {
  id: string;
  requesterEmail: string;
  requestType: 'client_access' | 'admin_access';
  companyName: string | null;
  clientCode: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
};

type AccessRequestAction = 'approve' | 'reject';
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

function requestTypeLabel(type: AccessRequestRow['requestType']) {
  return type === 'admin_access' ? 'Admin' : 'Client';
}

function accessStatusLabel(status: AccessRequestRow['status']) {
  const labels: Record<AccessRequestRow['status'], string> = {
    approved: 'Approved',
    cancelled: 'Cancelled',
    pending: 'Pending',
    rejected: 'Rejected',
  };

  return labels[status];
}

function accessStatusClass(status: AccessRequestRow['status']) {
  if (status === 'approved') return 'rounded-lg bg-[#e9f7f2] text-[#22735f]';
  if (status === 'rejected' || status === 'cancelled') {
    return 'rounded-lg bg-[#ffe9e7] text-[#a53a30]';
  }

  return 'rounded-lg bg-[#fff3d9] text-[#8a5b08]';
}

function accountRoleLabel(
  role: ManagedAccountRow['role'] | ManagedAccountRole,
) {
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

function accessLevelLabel(accessLevel: ClientAccessLevel | null) {
  const labels: Record<ClientAccessLevel, string> = {
    finance: 'Finance',
    owner: 'Owner',
    viewer: 'Viewer',
  };

  return accessLevel ? labels[accessLevel] : 'Không gán client';
}

function formatAccessRequestDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
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
  adminRole,
  userEmail,
}: {
  accessMode: 'super-admin-allowlist' | 'assigned' | 'local-preview';
  adminRole: AdminRole;
  userEmail: string;
}) {
  const isSuperAdmin = adminRole === 'super_admin';
  const [selectedClient, setSelectedClient] = useState(clients[0].id);
  const [selectedMonth, setSelectedMonth] = useState(adminMonths[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<
    'idle' | 'uploading' | 'stored' | 'failed'
  >('idle');
  const [uploadMessage, setUploadMessage] = useState(
    'File chỉ được publish lên dashboard khách hàng sau khi parser và validation pass.',
  );
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [accessRequestMessage, setAccessRequestMessage] = useState(
    isSuperAdmin
      ? 'Đang tải yêu cầu đăng ký...'
      : 'Chỉ super admin được xem yêu cầu cấp quyền.',
  );
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [managedAccounts, setManagedAccounts] = useState<ManagedAccountRow[]>(
    [],
  );
  const [accountEmail, setAccountEmail] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [accountRole, setAccountRole] = useState<ManagedAccountRole>('client');
  const [accountClientId, setAccountClientId] = useState(clients[0].id);
  const [accountAccessLevel, setAccountAccessLevel] =
    useState<ClientAccessLevel>('viewer');
  const [accountState, setAccountState] = useState<
    'idle' | 'loading' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [accountMessage, setAccountMessage] = useState(
    isSuperAdmin
      ? 'Tạo tài khoản theo email. Người dùng vẫn cần qua Cloudflare Access trước khi vào app.'
      : 'Tài khoản quản lý không có quyền tạo thêm người dùng.',
  );

  const activeClient =
    clients.find((client) => client.id === selectedClient) ?? clients[0];
  const validation = useMemo(
    () => validateWorkbook(selectedFile),
    [selectedFile],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAccessRequests() {
      if (!isSuperAdmin) return;

      try {
        const response = await fetch('/api/admin/access-requests');
        const result = (await response.json()) as {
          message?: string;
          requests?: AccessRequestRow[];
        };

        if (!response.ok) {
          throw new Error(result.message ?? 'Không thể tải yêu cầu đăng ký.');
        }

        if (!cancelled) {
          setAccessRequests(result.requests ?? []);
          setAccessRequestMessage(result.message ?? 'Loaded');
        }
      } catch (error) {
        if (!cancelled) {
          setAccessRequestMessage(
            error instanceof Error
              ? error.message
              : 'Không thể tải yêu cầu đăng ký.',
          );
        }
      }
    }

    void loadAccessRequests();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;

    async function loadManagedAccounts() {
      if (!isSuperAdmin) return;

      try {
        const response = await fetch('/api/admin/accounts');
        const result = (await response.json()) as {
          accounts?: ManagedAccountRow[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(result.message ?? 'Không thể tải tài khoản.');
        }

        if (!cancelled) {
          setManagedAccounts(result.accounts ?? []);
          setAccountMessage(result.message ?? 'Loaded');
          setAccountState('idle');
        }
      } catch (error) {
        if (!cancelled) {
          setAccountMessage(
            error instanceof Error
              ? error.message
              : 'Không thể tải danh sách tài khoản.',
          );
          setAccountState('failed');
        }
      }
    }

    void loadManagedAccounts();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  async function createManagedAccount(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!isSuperAdmin || accountState === 'saving') return;

    setAccountState('saving');
    setAccountMessage('Đang tạo tài khoản và ghi audit log...');

    try {
      const response = await fetch('/api/admin/accounts', {
        body: JSON.stringify({
          accessLevel: accountAccessLevel,
          clientId: accountClientId,
          displayName: accountDisplayName,
          email: accountEmail,
          role: accountRole,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const result = (await response.json()) as {
        accounts?: ManagedAccountRow[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? 'Không thể tạo tài khoản.');
      }

      setManagedAccounts(result.accounts ?? []);
      setAccountEmail('');
      setAccountDisplayName('');
      setAccountMessage(result.message ?? 'Đã tạo tài khoản.');
      setAccountState('saved');
    } catch (error) {
      setAccountMessage(
        error instanceof Error
          ? error.message
          : 'Không thể tạo tài khoản ở thời điểm này.',
      );
      setAccountState('failed');
    }
  }

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

  async function updateAccessRequest(
    accessRequest: AccessRequestRow,
    action: AccessRequestAction,
  ) {
    setActingRequestId(accessRequest.id);
    setAccessRequestMessage(
      action === 'approve'
        ? 'Đang duyệt quyền khách hàng...'
        : 'Đang từ chối yêu cầu...',
    );

    try {
      const response = await fetch(
        `/api/admin/access-requests/${encodeURIComponent(accessRequest.id)}`,
        {
          body: JSON.stringify({
            accessLevel: 'viewer',
            action,
            clientId: activeClient.id,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? 'Không thể xử lý yêu cầu.');
      }

      setAccessRequests((currentRequests) =>
        currentRequests.map((request) =>
          request.id === accessRequest.id
            ? {
                ...request,
                status: action === 'approve' ? 'approved' : 'rejected',
              }
            : request,
        ),
      );
      setAccessRequestMessage(result.message ?? 'Yêu cầu đã được xử lý.');
    } catch (error) {
      setAccessRequestMessage(
        error instanceof Error
          ? error.message
          : 'Không thể xử lý yêu cầu ở thời điểm này.',
      );
    } finally {
      setActingRequestId(null);
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
              {isSuperAdmin ? 'Super admin' : 'Quản lý'}
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
                  Access mode: {accessMode} · Role: {adminRole}
                </p>
              </div>
            </div>
          </section>
        </section>

        {isSuperAdmin ? (
          <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Tạo tài khoản</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Super admin cấp role cho quản lý hoặc khách hàng theo email.
                  </p>
                </div>
                <UserPlus className="size-5 text-primary" />
              </div>

              <form className="mt-5 grid gap-3" onSubmit={createManagedAccount}>
                <div className="space-y-2">
                  <span className="block text-sm font-medium">Email</span>
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

                <div className="space-y-2">
                  <span className="block text-sm font-medium">
                    Tên hiển thị
                  </span>
                  <Input
                    autoComplete="name"
                    onChange={(event) => {
                      setAccountDisplayName(event.target.value);
                    }}
                    placeholder="Tên người dùng hoặc công ty"
                    value={accountDisplayName}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <span className="block text-sm font-medium">Role</span>
                    <Select
                      onValueChange={(value) => {
                        if (value === 'admin' || value === 'client') {
                          setAccountRole(value);
                        }
                      }}
                      value={accountRole}
                    >
                      <SelectTrigger aria-label="Role" className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Khách hàng</SelectItem>
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
                          className="h-10 w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>

                {accountRole === 'client' ? (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium">
                      Khách hàng
                    </span>
                    <Select
                      onValueChange={(value) => {
                        if (value) setAccountClientId(value);
                      }}
                      value={accountClientId}
                    >
                      <SelectTrigger
                        aria-label="Khách hàng của tài khoản"
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
                ) : null}

                <Button
                  className="h-10 w-full"
                  disabled={accountState === 'saving'}
                  type="submit"
                >
                  <UserPlus className="size-4" />
                  {accountState === 'saving' ? 'Đang tạo...' : 'Tạo tài khoản'}
                </Button>
              </form>

              <p
                className={`mt-3 text-sm leading-6 ${
                  accountState === 'failed'
                    ? 'text-[#a53a30]'
                    : accountState === 'saved'
                      ? 'text-[#22735f]'
                      : 'text-muted-foreground'
                }`}
              >
                {accountMessage === 'Loaded'
                  ? 'Danh sách tài khoản đã được cập nhật.'
                  : accountMessage}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Tài khoản hệ thống</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Danh sách role đang active trong dashboard.
                  </p>
                </div>
                <ShieldCheck className="size-5 text-primary" />
              </div>

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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {managedAccounts.map((account) => (
                        <TableRow key={`${account.id}:${account.clientId}`}>
                          <TableCell className="font-medium">
                            <span className="block">{account.email}</span>
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
                            <Badge className="rounded-lg" variant="outline">
                              {account.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {account.lastSeenAt
                              ? formatAccessRequestDate(account.lastSeenAt)
                              : 'Chưa đăng nhập'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                  {accountState === 'loading'
                    ? 'Đang tải danh sách tài khoản...'
                    : accountMessage}
                </p>
              )}
            </section>
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                Tài khoản quản lý được phép upload và quản lý dữ liệu khách
                hàng, nhưng không được tạo thêm tài khoản. Việc cấp quyền chỉ
                nằm ở super admin.
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Role & permission</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Super admin tạo tài khoản. Server kiểm tra role ở mọi route và
                  API quan trọng.
                </p>
              </div>
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Permissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleRows.map((row) => (
                    <TableRow key={row.role}>
                      <TableCell className="font-medium">{row.role}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell>{row.permissions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Legacy requests</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chỉ dùng để xử lý request cũ nếu đã có trước khi tắt đăng ký
                  tự do.
                </p>
              </div>
              <Users className="size-5 text-primary" />
            </div>

            {accessRequests.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {request.requesterEmail}
                        </TableCell>
                        <TableCell>
                          {requestTypeLabel(request.requestType)}
                        </TableCell>
                        <TableCell>
                          <span className="block">
                            {request.companyName ?? 'Chưa khai báo'}
                          </span>
                          {request.clientCode ? (
                            <span className="text-xs text-muted-foreground">
                              {request.clientCode}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={accessStatusClass(request.status)}
                            variant="secondary"
                          >
                            {accessStatusLabel(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatAccessRequestDate(request.createdAt)}
                        </TableCell>
                        <TableCell>
                          {request.status === 'pending' ? (
                            <div className="flex flex-wrap gap-2">
                              {request.requestType === 'client_access' ? (
                                <Button
                                  disabled={actingRequestId === request.id}
                                  onClick={() => {
                                    void updateAccessRequest(
                                      request,
                                      'approve',
                                    );
                                  }}
                                  size="sm"
                                  variant="outline"
                                >
                                  Approve
                                </Button>
                              ) : (
                                <Badge className="rounded-lg" variant="outline">
                                  Owner only
                                </Badge>
                              )}
                              <Button
                                disabled={actingRequestId === request.id}
                                onClick={() => {
                                  void updateAccessRequest(request, 'reject');
                                }}
                                size="sm"
                                variant="destructive"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Done
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                {accessRequestMessage === 'Loaded'
                  ? 'Chưa có yêu cầu đăng ký đang chờ xử lý.'
                  : accessRequestMessage}
              </p>
            )}
            {accessRequests.length > 0 && accessRequestMessage !== 'Loaded' ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {accessRequestMessage}
              </p>
            ) : null}
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
              admin, backend vẫn kiểm tra session, role và quyền super admin
              trước khi ghi R2/D1 hoặc tạo tài khoản.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
