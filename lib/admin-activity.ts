export type AdminActivityRow = {
  action: string;
  actionLabel: string;
  actorDisplayName: string | null;
  actorEmail: string | null;
  clientCode: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown> | null;
  summary: string;
  targetId: string;
  targetType: string;
};

type AdminActivityDbRow = {
  action: string;
  actorDisplayName: string | null;
  actorEmail: string | null;
  clientCode: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  id: string;
  metadata: string | null;
  targetId: string;
  targetType: string;
};

export async function listAdminActivity(
  db: D1Database,
  limit = 20,
): Promise<AdminActivityRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
  const rows = await db
    .prepare(
      `SELECT
         al.id,
         al.action,
         al.target_type AS targetType,
         al.target_id AS targetId,
         al.metadata,
         al.created_at AS createdAt,
         al.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         u.email AS actorEmail,
         u.display_name AS actorDisplayName
       FROM audit_logs al
       LEFT JOIN users u
         ON u.id = al.actor_user_id
       LEFT JOIN clients c
         ON c.id = al.client_id
       ORDER BY al.created_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<AdminActivityDbRow>();

  return rows.results.map((row) => {
    const metadata = parseMetadata(row.metadata);

    return {
      ...row,
      actionLabel: activityActionLabel(row.action),
      clientCode:
        row.clientCode ??
        readString(metadata?.clientCode) ??
        readString(metadata?.code),
      clientName:
        row.clientName ??
        readString(metadata?.clientName) ??
        readString(metadata?.name),
      metadata,
      summary: activitySummary(row.action, metadata),
    };
  });
}

export function fallbackAdminActivity(): AdminActivityRow[] {
  return [];
}

function activityActionLabel(action: string) {
  const labels: Record<string, string> = {
    activation_invite_resent: 'Gửi lại link kích hoạt',
    admin_statement_delete: 'Xoá statement',
    admin_statement_lock: 'Lock statement',
    admin_statement_publish: 'Publish statement',
    admin_statement_unpublish: 'Ẩn statement',
    admin_statement_upload_imported: 'Upload statement',
    client_archived: 'Lưu trữ khách hàng',
    client_deleted: 'Xoá khách hàng',
    client_profile_updated: 'Sửa khách hàng',
    managed_account_created: 'Tạo tài khoản',
    managed_account_status_updated: 'Cập nhật tài khoản',
    password_reset_requested: 'Gửi link đổi mật khẩu',
    settlement_reminder_dry_run: 'Preview reminder',
    settlement_reminder_retry: 'Retry reminder',
    settlement_reminder_sent: 'Gửi reminder',
    track_guarantee_archive: 'Archive GM',
    track_guarantee_created: 'Tạo GM',
    track_guarantee_reactivate: 'Kích hoạt GM',
  };

  return labels[action] ?? action.replace(/_/g, ' ');
}

function activitySummary(
  action: string,
  metadata: Record<string, unknown> | null,
) {
  if (!metadata) return '';

  if (action === 'admin_statement_upload_imported') {
    return compactParts([
      readString(metadata.period),
      readString(metadata.filename),
      formatRows(metadata.rowCount),
    ]);
  }

  if (
    action === 'admin_statement_delete' ||
    action === 'admin_statement_lock' ||
    action === 'admin_statement_publish' ||
    action === 'admin_statement_unpublish'
  ) {
    return compactParts([
      readString(metadata.period),
      readString(metadata.currency),
      readString(metadata.status),
    ]);
  }

  if (
    action === 'managed_account_created' ||
    action === 'managed_account_status_updated' ||
    action === 'password_reset_requested' ||
    action === 'activation_invite_resent'
  ) {
    return compactParts([
      readString(metadata.email),
      readString(metadata.role),
      readString(metadata.status),
    ]);
  }

  if (action === 'client_profile_updated') {
    return compactParts([readString(metadata.name), readString(metadata.code)]);
  }

  if (action === 'client_archived' || action === 'client_deleted') {
    return compactParts([readString(metadata.name), readString(metadata.code)]);
  }

  if (
    action === 'track_guarantee_archive' ||
    action === 'track_guarantee_created' ||
    action === 'track_guarantee_reactivate'
  ) {
    return compactParts([
      readString(metadata.trackTitle),
      formatMoney(metadata.amount ?? metadata.balanceAmount),
      readString(metadata.status),
    ]);
  }

  if (
    action === 'settlement_reminder_dry_run' ||
    action === 'settlement_reminder_retry' ||
    action === 'settlement_reminder_sent'
  ) {
    return compactParts([
      readString(metadata.period),
      formatCount(metadata.targetCount, 'targets'),
      formatCount(metadata.sentCount, 'sent'),
      formatCount(metadata.failedCount, 'failed'),
    ]);
  }

  return '';
}

function parseMetadata(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function compactParts(parts: Array<string | null>) {
  return parts.filter(Boolean).join(' / ');
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatRows(value: unknown) {
  const rows = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rows) || rows <= 0) return null;
  return `${new Intl.NumberFormat('en-US').format(rows)} rows`;
}

function formatCount(value: unknown, label: string) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count) || count <= 0) return null;

  return `${new Intl.NumberFormat('en-US').format(count)} ${label}`;
}

function formatMoney(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}
