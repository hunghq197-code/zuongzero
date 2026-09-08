'use client';

import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Send,
  ShieldAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type RequestType = 'client_access' | 'admin_access';

export function RegistrationForm({
  initialRequestType = 'client_access',
  userEmail,
}: {
  initialRequestType?: RequestType;
  userEmail: string;
}) {
  const [requestType, setRequestType] =
    useState<RequestType>(initialRequestType);
  const [companyName, setCompanyName] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [contactName, setContactName] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState(
    'Yêu cầu sẽ vào hàng chờ duyệt. Form này không tự cấp quyền.',
  );

  async function submitRequest() {
    setState('submitting');
    setMessage('Đang gửi yêu cầu...');

    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestType,
          companyName,
          clientCode,
          contactName,
          reason,
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? 'Không thể gửi yêu cầu.');
      }

      setState('done');
      setMessage(result.message ?? 'Yêu cầu đã được ghi nhận.');
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không thể gửi yêu cầu ở thời điểm này.',
      );
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Signed in as
            </p>
            <h2 className="mt-1 text-xl font-semibold">{userEmail}</h2>
          </div>
          <KeyRound className="size-6 text-primary" />
        </div>

        <div className="mt-5 grid gap-4">
          <div className="space-y-2">
            <span className="block text-sm font-medium">Loại tài khoản</span>
            <Select
              onValueChange={(value) => {
                if (value === 'client_access' || value === 'admin_access') {
                  setRequestType(value);
                }
              }}
              value={requestType}
            >
              <SelectTrigger aria-label="Loại tài khoản" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_access">
                  Khách hàng xem dashboard
                </SelectItem>
                <SelectItem value="admin_access">
                  Admin quản lý dữ liệu
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <span className="block text-sm font-medium">Tên công ty</span>
              <Input
                maxLength={160}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="VD: VIEENT Co., Ltd"
                value={companyName}
              />
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-medium">Mã client</span>
              <Input
                maxLength={48}
                onChange={(event) => setClientCode(event.target.value)}
                placeholder="VD: VIEENT"
                value={clientCode}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium">Người liên hệ</span>
            <Input
              maxLength={160}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Tên người phụ trách tài khoản"
              value={contactName}
            />
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium">
              Lý do / ghi chú xác minh
            </span>
            <Textarea
              className="min-h-[120px]"
              maxLength={800}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                requestType === 'admin_access'
                  ? 'Nêu phạm vi công việc và lý do cần quyền admin.'
                  : 'Ghi thêm thông tin để admin đối chiếu đúng khách hàng.'
              }
              value={reason}
            />
          </div>
        </div>

        <Button
          className="mt-5 h-10 w-full gap-2"
          disabled={state === 'submitting' || state === 'done'}
          onClick={submitRequest}
        >
          {state === 'done' ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {state === 'submitting'
            ? 'Đang gửi...'
            : state === 'done'
              ? 'Đã gửi yêu cầu'
              : 'Gửi yêu cầu duyệt quyền'}
        </Button>

        <p
          className={`mt-3 text-sm leading-6 ${
            state === 'error'
              ? 'text-[#a53a30]'
              : state === 'done'
                ? 'text-[#22735f]'
                : 'text-muted-foreground'
          }`}
        >
          {message}
        </p>
      </div>

      <aside className="rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
            {requestType === 'admin_access' ? (
              <ShieldAlert className="size-5" />
            ) : (
              <Building2 className="size-5" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#3a2a0a]">
              {requestType === 'admin_access'
                ? 'Admin cần allowlist'
                : 'Khách cần được gán client'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6f5318]">
              {requestType === 'admin_access'
                ? 'Gửi form không tạo quyền admin. Owner phải thêm email vào ADMIN_EMAILS hoặc duyệt bằng cơ chế quản trị server.'
                : 'Sau khi duyệt, admin sẽ gán email này vào đúng client. Dashboard chỉ hiện dữ liệu của client đó.'}
            </p>
          </div>
        </div>
      </aside>
    </section>
  );
}
