import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import {
  fallbackCustomerRows,
  listManagedCustomers,
} from '@/lib/admin-customers';
import { getAdminOverviewData } from '@/lib/admin-dashboard';
import { currentCalendarQuarter } from '@/lib/reporting-periods';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';
import { ensureUserRecord } from '@/lib/user-records';

type CustomerBody = {
  action?: unknown;
  clientId?: unknown;
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

type AdminAuthorization =
  | {
      ok: true;
      role: 'super_admin' | 'admin';
      user: {
        displayName: string;
        email: string;
        userId: string;
      };
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    if (!env.DB) {
      if (
        normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
      ) {
        return Response.json({
          customers: fallbackCustomerRows(),
          message: 'Preview chưa có D1. Production sẽ hiển thị client thật.',
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc danh sách khách hàng.', 503);
    }

    return Response.json({
      customers: await listManagedCustomers(env.DB),
      message: 'Loaded',
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      'Không thể tải danh sách khách hàng lúc này.',
    );
  }
}

export async function PATCH(request: Request) {
  try {
    return await updateCustomerResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể cập nhật khách hàng lúc này.');
  }
}

export async function DELETE(request: Request) {
  try {
    return await deleteCustomerResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể xoá khách hàng lúc này.');
  }
}

async function updateCustomerResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để cập nhật khách hàng.', 503);
  }

  const body = await readCustomerBody(request);
  if (!body) return jsonError('Payload không hợp lệ.', 400);

  const clientId = cleanId(body.clientId);
  if (!clientId) return jsonError('Cần chọn khách hàng hợp lệ.', 400);

  const existingClient = await findClientById(env.DB, clientId);
  if (!existingClient) return jsonError('Không tìm thấy khách hàng.', 404);

  const name = cleanText(body.name, 160) || existingClient.name;
  const code = normalizeClientCode(body.code) || existingClient.code;
  const status = parseCustomerStatus(body.status) ?? existingClient.status;
  const codeConflict = await findClientCodeConflict(env.DB, clientId, code);
  if (codeConflict) return jsonError('Mã khách hàng này đã tồn tại.', 409);

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE clients
       SET code = ?,
           legal_name = ?,
           display_name = ?,
           status = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(code, name, name, status, now, clientId),
    createAuditLog(
      actor.id,
      clientId,
      'client_profile_updated',
      'client',
      clientId,
      {
        code,
        name,
        previousCode: existingClient.code,
        previousName: existingClient.name,
        previousStatus: existingClient.status,
        status,
      },
      now,
    ),
  ]);

  return Response.json({
    customers: await listManagedCustomers(env.DB),
    overview: await getAdminOverviewData(env.DB, currentCalendarQuarter()),
    message: 'Đã cập nhật thông tin khách hàng.',
  });
}

async function deleteCustomerResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (authorization.role !== 'super_admin') {
    return jsonError('Chỉ super admin được xoá khách hàng.', 403);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để xoá khách hàng.', 503);
  }

  const body = await readCustomerBody(request);
  if (!body) return jsonError('Payload không hợp lệ.', 400);

  const clientId = cleanId(body.clientId);
  if (!clientId) return jsonError('Cần chọn khách hàng hợp lệ.', 400);

  const action = body.action === 'delete' ? 'delete' : 'archive';
  const existingClient = await findClientById(env.DB, clientId);
  if (!existingClient) return jsonError('Không tìm thấy khách hàng.', 404);

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });

  if (action === 'archive') {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE clients
         SET status = 'archived',
             updated_at = ?
         WHERE id = ?`,
      ).bind(now, clientId),
      createAuditLog(
        actor.id,
        clientId,
        'client_archived',
        'client',
        clientId,
        {
          code: existingClient.code,
          name: existingClient.name,
        },
        now,
      ),
    ]);

    return Response.json({
      customers: await listManagedCustomers(env.DB),
      overview: await getAdminOverviewData(env.DB, currentCalendarQuarter()),
      message: 'Đã lưu trữ khách hàng.',
    });
  }

  const uploadKeys = await listUploadObjectKeys(env.DB, clientId);
  if (env.FILES) {
    await Promise.all(uploadKeys.map((key) => env.FILES.delete(key)));
  }

  await env.DB.batch([
    createAuditLog(
      actor.id,
      null,
      'client_deleted',
      'client',
      clientId,
      {
        code: existingClient.code,
        name: existingClient.name,
        uploadFileCount: uploadKeys.length,
      },
      now,
    ),
    env.DB.prepare(
      `DELETE FROM auth_sessions
       WHERE user_id IN (
         SELECT user_id
         FROM client_users
         WHERE client_id = ?
       )`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM account_invites
       WHERE user_id IN (
         SELECT user_id
         FROM client_users
         WHERE client_id = ?
       )`,
    ).bind(clientId),
    env.DB.prepare(
      `UPDATE users
       SET status = 'disabled'
       WHERE role = 'client'
         AND id IN (
           SELECT user_id
           FROM client_users
           WHERE client_id = ?
         )`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM track_guarantee_recoupments
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM track_guarantees
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM revenue_breakdowns
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM statements
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM uploads
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM report_periods
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM client_users
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `UPDATE audit_logs
       SET client_id = NULL
       WHERE client_id = ?`,
    ).bind(clientId),
    env.DB.prepare(
      `DELETE FROM clients
       WHERE id = ?`,
    ).bind(clientId),
  ]);

  return Response.json({
    customers: await listManagedCustomers(env.DB),
    overview: await getAdminOverviewData(env.DB, currentCalendarQuarter()),
    message: 'Đã xoá khách hàng và dữ liệu liên quan.',
  });
}

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false,
      message: 'Bạn cần đăng nhập trước khi quản lý khách hàng.',
      status: 401,
    };
  }

  const access = await getAdminAccess(user.email);
  if (!access.allowed) {
    return {
      ok: false,
      message: access.reason,
      status: access.status,
    };
  }

  return {
    ok: true,
    role: access.role,
    user,
  };
}

async function readCustomerBody(
  request: Request,
): Promise<CustomerBody | null> {
  try {
    return (await request.json()) as CustomerBody;
  } catch {
    return null;
  }
}

async function findClientById(db: D1Database, clientId: string) {
  return db
    .prepare(
      `SELECT
         id,
         code,
         display_name AS name,
         status
       FROM clients
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(clientId)
    .first<{
      code: string;
      id: string;
      name: string;
      status: 'active' | 'locked' | 'archived';
    }>();
}

async function findClientCodeConflict(
  db: D1Database,
  clientId: string,
  code: string,
) {
  return db
    .prepare(
      `SELECT id
       FROM clients
       WHERE upper(code) = ?
         AND id != ?
       LIMIT 1`,
    )
    .bind(code, clientId)
    .first<{ id: string }>();
}

async function listUploadObjectKeys(db: D1Database, clientId: string) {
  const rows = await db
    .prepare(
      `SELECT object_key AS objectKey
       FROM uploads
       WHERE client_id = ?`,
    )
    .bind(clientId)
    .all<{ objectKey: string }>();

  return rows.results.map((row) => row.objectKey).filter(Boolean);
}

function createAuditLog(
  actorUserId: string,
  clientId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
) {
  return env.DB.prepare(
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    actorUserId,
    clientId,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata),
    now,
  );
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeClientCode(value: unknown) {
  return cleanText(value, 48)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function parseCustomerStatus(value: unknown) {
  if (value === 'active' || value === 'locked' || value === 'archived') {
    return value;
  }

  return null;
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-customers:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
