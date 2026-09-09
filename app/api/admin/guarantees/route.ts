import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';
import {
  hasGuaranteeTables,
  listTrackGuarantees,
  normalizeTrackKey,
  type TrackGuaranteeStatus,
} from '@/lib/guarantees';
import { ensureUserRecord } from '@/lib/user-records';

type GuaranteeBody = {
  action?: unknown;
  amount?: unknown;
  clientId?: unknown;
  guaranteeId?: unknown;
  notes?: unknown;
  trackTitle?: unknown;
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

type GuaranteeClient = {
  code: string;
  id: string;
  name: string;
  status: 'active' | 'locked' | 'archived';
};

type GuaranteeTarget = {
  balanceAmount: number;
  clientCode: string;
  clientId: string;
  clientName: string;
  id: string;
  status: TrackGuaranteeStatus;
  trackTitle: string;
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
          guarantees: [],
          message: 'Preview chưa có D1. Production sẽ hiển thị GM thật.',
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc GM.', 503);
    }

    return Response.json({
      guarantees: await listTrackGuarantees(env.DB),
      message: 'Loaded',
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tải danh sách GM lúc này.');
  }
}

export async function POST(request: Request) {
  try {
    return await createGuaranteeResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tạo GM lúc này.');
  }
}

export async function PATCH(request: Request) {
  try {
    return await updateGuaranteeResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể cập nhật GM lúc này.');
  }
}

async function createGuaranteeResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để tạo GM.', 503);
  }
  if (!(await hasGuaranteeTables(env.DB))) {
    return jsonError(
      'D1 chưa áp migration GM. Hãy chạy migration 0006 trước khi tạo GM.',
      503,
    );
  }

  const body = await readGuaranteeBody(request);
  if (!body) return jsonError('Payload không hợp lệ.', 400);

  const clientId = cleanId(body.clientId);
  const trackTitle = cleanText(body.trackTitle, 220);
  const trackKey = normalizeTrackKey(trackTitle);
  const amount = readVndAmount(body.amount);
  const notes = cleanText(body.notes, 500) || null;

  if (!clientId) return jsonError('Cần chọn khách hàng hợp lệ.', 400);
  if (!trackTitle || !trackKey) {
    return jsonError('Cần nhập tên bài hát cho GM.', 400);
  }
  if (!amount || amount <= 0) {
    return jsonError('Số tiền GM phải lớn hơn 0 VNĐ.', 400);
  }

  const client = await findClient(env.DB, clientId);
  if (!client || client.status === 'archived') {
    return jsonError('Khách hàng không hợp lệ hoặc đã lưu trữ.', 400);
  }

  const duplicate = await findActiveGuarantee(env.DB, clientId, trackKey);
  if (duplicate) {
    return jsonError(
      'Bài hát này đang có GM active. Hãy archive GM cũ trước khi tạo mới.',
      409,
    );
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });
  const guaranteeId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO track_guarantees (
         id,
         client_id,
         track_title,
         track_key,
         initial_amount,
         recouped_amount,
         balance_amount,
         status,
         notes,
         created_by_user_id,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?, ?)`,
    ).bind(
      guaranteeId,
      clientId,
      trackTitle,
      trackKey,
      amount,
      amount,
      notes,
      actor.id,
      now,
      now,
    ),
    createAuditLog(
      actor.id,
      clientId,
      'track_guarantee_created',
      'track_guarantee',
      guaranteeId,
      {
        amount,
        clientCode: client.code,
        clientName: client.name,
        trackTitle,
      },
      now,
    ),
  ]);

  return Response.json({
    guarantees: await listTrackGuarantees(env.DB),
    message: 'Đã tạo GM cho bài hát.',
  });
}

async function updateGuaranteeResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để cập nhật GM.', 503);
  }
  if (!(await hasGuaranteeTables(env.DB))) {
    return jsonError(
      'D1 chưa áp migration GM. Hãy chạy migration 0006 trước khi cập nhật GM.',
      503,
    );
  }

  const body = await readGuaranteeBody(request);
  if (!body) return jsonError('Payload không hợp lệ.', 400);

  const guaranteeId = cleanId(body.guaranteeId);
  const action = parseGuaranteeAction(body.action);
  if (!guaranteeId || !action) {
    return jsonError('Cần chọn GM và hành động hợp lệ.', 400);
  }

  const guarantee = await findGuarantee(env.DB, guaranteeId);
  if (!guarantee) return jsonError('Không tìm thấy GM.', 404);

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });
  const nextStatus =
    action === 'archive'
      ? 'archived'
      : guarantee.balanceAmount > 0
        ? 'active'
        : 'recouped';

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE track_guarantees
       SET status = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(nextStatus, now, guaranteeId),
    createAuditLog(
      actor.id,
      guarantee.clientId,
      `track_guarantee_${action}`,
      'track_guarantee',
      guaranteeId,
      {
        balanceAmount: guarantee.balanceAmount,
        clientCode: guarantee.clientCode,
        clientName: guarantee.clientName,
        previousStatus: guarantee.status,
        status: nextStatus,
        trackTitle: guarantee.trackTitle,
      },
      now,
    ),
  ]);

  return Response.json({
    guarantees: await listTrackGuarantees(env.DB),
    message:
      action === 'archive' ? 'Đã archive GM.' : 'Đã kích hoạt lại GM.',
  });
}

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false,
      message: 'Bạn cần đăng nhập trước khi quản lý GM.',
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

async function readGuaranteeBody(
  request: Request,
): Promise<GuaranteeBody | null> {
  try {
    return (await request.json()) as GuaranteeBody;
  } catch {
    return null;
  }
}

async function findClient(db: D1Database, clientId: string) {
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
    .first<GuaranteeClient>();
}

async function findActiveGuarantee(
  db: D1Database,
  clientId: string,
  trackKey: string,
) {
  return db
    .prepare(
      `SELECT id
       FROM track_guarantees
       WHERE client_id = ?
         AND track_key = ?
         AND status = 'active'
       LIMIT 1`,
    )
    .bind(clientId, trackKey)
    .first<{ id: string }>();
}

async function findGuarantee(db: D1Database, guaranteeId: string) {
  return db
    .prepare(
      `SELECT
         g.id,
         g.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         g.track_title AS trackTitle,
         g.status,
         g.balance_amount AS balanceAmount
       FROM track_guarantees g
       JOIN clients c
         ON c.id = g.client_id
       WHERE g.id = ?
       LIMIT 1`,
    )
    .bind(guaranteeId)
    .first<GuaranteeTarget>();
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

function parseGuaranteeAction(value: unknown) {
  if (value === 'archive' || value === 'reactivate') return value;
  return null;
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function readVndAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value !== 'string') return 0;
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return 0;

  return Number(digits);
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-guarantees:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
