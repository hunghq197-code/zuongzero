import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { normalizeEmail } from '@/lib/identity';
import { ensureUserRecord } from '@/lib/user-records';

type RouteContext = {
  params: { requestId?: string } | Promise<{ requestId?: string }>;
};

type AccessRequestAction = 'approve' | 'reject';
type ClientAccessLevel = 'owner' | 'viewer' | 'finance';

type AccessRequestBody = {
  accessLevel?: unknown;
  action?: unknown;
  clientId?: unknown;
};

type StoredAccessRequest = {
  id: string;
  requesterUserId: string;
  requesterEmail: string;
  requestType: 'client_access' | 'admin_access';
  clientCode: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
};

type ClientRow = {
  id: string;
  displayName: string;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: RouteContext) {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi xử lý yêu cầu.', 401);
  }

  const adminAccess = await getAdminAccess(user.email);
  if (!adminAccess.allowed) {
    return jsonError(adminAccess.reason, adminAccess.status);
  }

  if (adminAccess.role !== 'super_admin') {
    return jsonError('Chỉ super admin được xử lý yêu cầu cấp quyền.', 403);
  }

  const params = await Promise.resolve(context.params);
  const requestId = cleanText(params.requestId, 80);
  if (!requestId) {
    return jsonError('Thiếu mã yêu cầu.', 400);
  }

  let body: AccessRequestBody;
  try {
    body = (await request.json()) as AccessRequestBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  const action = parseAction(body.action);
  if (!action) {
    return jsonError('Thao tác không hợp lệ.', 400);
  }

  if (!env.DB) {
    if (normalizeEmail(user.email).endsWith('@sites.test')) {
      return jsonError(
        'Preview chưa có D1 nên không thể ghi thay đổi duyệt quyền.',
        503,
      );
    }

    return jsonError('D1 chưa sẵn sàng để xử lý yêu cầu đăng ký.', 503);
  }

  const accessRequest = await env.DB.prepare(
    `SELECT
       id,
       requester_user_id AS requesterUserId,
       requester_email AS requesterEmail,
       request_type AS requestType,
       client_code AS clientCode,
       status
     FROM access_requests
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(requestId)
    .first<StoredAccessRequest>();

  if (!accessRequest) {
    return jsonError('Không tìm thấy yêu cầu đăng ký.', 404);
  }

  if (accessRequest.status !== 'pending') {
    return jsonError('Yêu cầu này đã được xử lý trước đó.', 409);
  }

  if (action === 'reject') {
    const reviewer = await ensureUserRecord(env.DB, {
      displayName: user.displayName,
      email: user.email,
      lastSeenAt: new Date().toISOString(),
      role: adminAccess.role,
      userId: user.userId,
    });
    await rejectAccessRequest(accessRequest, reviewer.id);
    return Response.json({
      requestId: accessRequest.id,
      status: 'rejected',
      message: 'Yêu cầu đã bị từ chối và được ghi audit log.',
    });
  }

  if (accessRequest.requestType === 'admin_access') {
    return jsonError(
      'Không duyệt quyền quản lý từ request tự gửi. Super admin tạo tài khoản quản lý trong mục Tài khoản hệ thống.',
      403,
    );
  }

  const accessLevel = parseClientAccessLevel(body.accessLevel);
  if (!accessLevel) {
    return jsonError('Access level khách hàng không hợp lệ.', 400);
  }

  const client = await resolveClient(
    env.DB,
    accessRequest.clientCode,
    body.clientId,
  );
  if (!client) {
    return jsonError(
      'Không tìm thấy client active phù hợp. Kiểm tra client code hoặc chọn đúng client trước khi approve.',
      400,
    );
  }

  const reviewer = await ensureUserRecord(env.DB, {
    displayName: user.displayName,
    email: user.email,
    lastSeenAt: new Date().toISOString(),
    role: adminAccess.role,
    userId: user.userId,
  });

  await approveClientAccessRequest(
    accessRequest,
    reviewer.id,
    client,
    accessLevel,
  );

  return Response.json({
    requestId: accessRequest.id,
    clientId: client.id,
    status: 'approved',
    message: `Đã cấp quyền ${accessLevel} cho ${accessRequest.requesterEmail} tại ${client.displayName}.`,
  });
}

async function rejectAccessRequest(
  accessRequest: StoredAccessRequest,
  reviewerUserId: string,
) {
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE access_requests
       SET status = 'rejected',
           reviewed_by_user_id = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(reviewerUserId, now, now, accessRequest.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (
         id,
         actor_user_id,
         client_id,
         action,
         target_type,
         target_id,
         metadata,
         created_at
       )
       VALUES (?, ?, NULL, 'access_request_rejected', 'access_request', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      reviewerUserId,
      accessRequest.id,
      JSON.stringify({
        requesterEmail: accessRequest.requesterEmail,
        requestType: accessRequest.requestType,
      }),
      now,
    ),
  ]);
}

async function approveClientAccessRequest(
  accessRequest: StoredAccessRequest,
  reviewerUserId: string,
  client: ClientRow,
  accessLevel: ClientAccessLevel,
) {
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET role = CASE
           WHEN role IN ('super_admin', 'admin') THEN role
           ELSE 'client'
         END,
         status = 'active',
         last_seen_at = COALESCE(last_seen_at, ?)
       WHERE id = ?`,
    ).bind(now, accessRequest.requesterUserId),
    env.DB.prepare(
      `INSERT INTO client_users (
         id,
         client_id,
         user_id,
         access_level,
         status,
         created_at
       )
       VALUES (?, ?, ?, ?, 'active', ?)
       ON CONFLICT(client_id, user_id) DO UPDATE SET
         access_level = excluded.access_level,
         status = 'active'`,
    ).bind(
      crypto.randomUUID(),
      client.id,
      accessRequest.requesterUserId,
      accessLevel,
      now,
    ),
    env.DB.prepare(
      `UPDATE access_requests
       SET status = 'approved',
           reviewed_by_user_id = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(reviewerUserId, now, now, accessRequest.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (
         id,
         actor_user_id,
         client_id,
         action,
         target_type,
         target_id,
         metadata,
         created_at
       )
       VALUES (?, ?, ?, 'client_access_approved', 'access_request', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      reviewerUserId,
      client.id,
      accessRequest.id,
      JSON.stringify({
        accessLevel,
        requesterEmail: accessRequest.requesterEmail,
      }),
      now,
    ),
  ]);
}

async function resolveClient(
  db: D1Database,
  requestClientCode: string | null,
  selectedClientId: unknown,
) {
  const clientCode = cleanText(requestClientCode, 48).toLowerCase();
  if (clientCode) {
    const clientByCode = await db
      .prepare(
        `SELECT id, display_name AS displayName
       FROM clients
       WHERE lower(code) = ?
         AND status = 'active'
       LIMIT 1`,
      )
      .bind(clientCode)
      .first<ClientRow>();

    if (clientByCode) return clientByCode;
  }

  const clientId = cleanText(selectedClientId, 120);
  if (!clientId) return null;

  return db
    .prepare(
      `SELECT id, display_name AS displayName
     FROM clients
     WHERE id = ?
       AND status = 'active'
     LIMIT 1`,
    )
    .bind(clientId)
    .first<ClientRow>();
}

function parseAction(value: unknown): AccessRequestAction | null {
  if (value === 'approve' || value === 'reject') return value;
  return null;
}

function parseClientAccessLevel(value: unknown): ClientAccessLevel | null {
  if (value === undefined || value === null || value === '') return 'viewer';
  if (value === 'owner' || value === 'viewer' || value === 'finance') {
    return value;
  }

  return null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
