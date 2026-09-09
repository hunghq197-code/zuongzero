import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  fallbackAdminOverviewData,
  fallbackAdminStatements,
  getAdminOverviewData,
  listAdminStatements,
} from '@/lib/admin-dashboard';
import { getAdminAccess } from '@/lib/admin-auth';
import { currentCalendarMonth } from '@/lib/calendar-months';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';
import { ensureUserRecord } from '@/lib/user-records';

const PERIOD_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

type StatementBody = {
  action?: unknown;
  reportPeriodId?: unknown;
};

type StatementTarget = {
  clientId: string;
  currency: string;
  period: string;
  reportPeriodId: string;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
};

type StatementDeleteTarget = StatementTarget & {
  clientCode: string;
  clientName: string;
  filename: string | null;
  objectKey: string | null;
  sourceUploadId: string | null;
  uploadReportPeriodId: string | null;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    const url = new URL(request.url);
    const clientId = cleanId(url.searchParams.get('clientId'));
    const requestedPeriod = url.searchParams.get('period') ?? '';
    const period = PERIOD_PATTERN.test(requestedPeriod)
      ? requestedPeriod
      : null;

    if (!env.DB) {
      if (
        normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
      ) {
        return Response.json({
          statements: fallbackAdminStatements(),
          overview: fallbackAdminOverviewData(period ?? currentCalendarMonth()),
          message: 'Loaded',
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc statement.', 503);
    }

    return Response.json({
      statements: await listAdminStatements(env.DB, {
        clientId: clientId || null,
        period,
      }),
      overview: await getAdminOverviewData(
        env.DB,
        period ?? currentCalendarMonth(),
      ),
      message: 'Loaded',
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tải statement lúc này.');
  }
}

export async function PATCH(request: Request) {
  try {
    return await updateStatementResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể cập nhật statement lúc này.');
  }
}

export async function DELETE(request: Request) {
  try {
    return await deleteStatementResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể xoá statement lúc này.');
  }
}

async function updateStatementResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để cập nhật statement.', 503);
  }

  let body: StatementBody;
  try {
    body = (await request.json()) as StatementBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  const reportPeriodId = cleanId(body.reportPeriodId);
  const action = parseStatementAction(body.action);
  if (!reportPeriodId || !action) {
    return jsonError('Cần chọn statement và hành động hợp lệ.', 400);
  }

  const statement = await findStatementTarget(env.DB, reportPeriodId);
  if (!statement) return jsonError('Không tìm thấy statement.', 404);

  if (statement.status === 'locked' && action !== 'publish') {
    return jsonError('Statement đã lock. Hãy mở lại trước khi chỉnh.', 400);
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });
  const nextStatus = statementStatusForAction(action);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE report_periods
       SET status = ?,
           published_at = CASE
             WHEN ? = 'published' THEN COALESCE(published_at, ?)
             WHEN ? = 'locked' THEN COALESCE(published_at, ?)
             ELSE NULL
           END,
           locked_at = CASE WHEN ? = 'locked' THEN ? ELSE NULL END,
           updated_at = ?
       WHERE id = ?
         AND currency IN ('USD', 'VND')`,
    ).bind(
      nextStatus,
      nextStatus,
      now,
      nextStatus,
      now,
      nextStatus,
      now,
      now,
      reportPeriodId,
    ),
    createAuditLog(
      actor.id,
      statement.clientId,
      `admin_statement_${action}`,
      'report_period',
      reportPeriodId,
      {
        currency: statement.currency,
        period: statement.period,
        previousStatus: statement.status,
        status: nextStatus,
      },
      now,
    ),
  ]);

  return Response.json({
    overview: await getAdminOverviewData(env.DB, statement.period),
    statements: await listAdminStatements(env.DB, {
      period: statement.period,
    }),
    message: statementMessage(action),
  });
}

async function deleteStatementResponse(request: Request) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (authorization.role !== 'super_admin') {
    return jsonError('Chỉ super admin được xoá statement.', 403);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để xoá statement.', 503);
  }

  let body: StatementBody;
  try {
    body = (await request.json()) as StatementBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  const reportPeriodId = cleanId(body.reportPeriodId);
  if (!reportPeriodId) {
    return jsonError('Cần chọn statement hợp lệ.', 400);
  }

  const statement = await findStatementDeleteTarget(env.DB, reportPeriodId);
  if (!statement) return jsonError('Không tìm thấy statement.', 404);

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
      `DELETE FROM revenue_breakdowns
       WHERE report_period_id = ?`,
    ).bind(reportPeriodId),
    env.DB.prepare(
      `DELETE FROM statements
       WHERE report_period_id = ?`,
    ).bind(reportPeriodId),
    env.DB.prepare(
      `DELETE FROM report_periods
       WHERE id = ?`,
    ).bind(reportPeriodId),
    createAuditLog(
      actor.id,
      statement.clientId,
      'admin_statement_delete',
      'report_period',
      reportPeriodId,
      {
        currency: statement.currency,
        clientCode: statement.clientCode,
        clientName: statement.clientName,
        filename: statement.filename,
        period: statement.period,
        previousStatus: statement.status,
      },
      now,
    ),
  ]);

  if (statement.sourceUploadId) {
    const uploadStillUsed = await isUploadStillUsed(
      env.DB,
      statement.sourceUploadId,
    );

    if (!uploadStillUsed) {
      if (env.FILES && statement.objectKey) {
        await env.FILES.delete(statement.objectKey);
      }

      await env.DB.batch([
        env.DB.prepare(
          `DELETE FROM uploads
           WHERE id = ?`,
        ).bind(statement.sourceUploadId),
        env.DB.prepare(
          `DELETE FROM report_periods
           WHERE id = ?
             AND currency = 'MULTI'
             AND NOT EXISTS (
               SELECT 1
               FROM uploads
               WHERE report_period_id = ?
             )`,
        ).bind(
          statement.uploadReportPeriodId ?? '',
          statement.uploadReportPeriodId ?? '',
        ),
      ]);
    }
  }

  return Response.json({
    overview: await getAdminOverviewData(env.DB, statement.period),
    statements: await listAdminStatements(env.DB, {
      period: statement.period,
    }),
    message: 'Đã xoá statement và dữ liệu breakdown liên quan.',
  });
}

async function authorizeAdmin() {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false as const,
      message: 'Bạn cần đăng nhập trước khi quản lý statement.',
      status: 401,
    };
  }

  const access = await getAdminAccess(user.email);
  if (!access.allowed) {
    return {
      ok: false as const,
      message: access.reason,
      status: access.status,
    };
  }

  return {
    ok: true as const,
    role: access.role,
    user,
  };
}

async function findStatementTarget(db: D1Database, reportPeriodId: string) {
  return db
    .prepare(
      `SELECT
         rp.id AS reportPeriodId,
         rp.client_id AS clientId,
         rp.period,
         rp.currency,
         rp.status
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       WHERE rp.id = ?
         AND rp.currency IN ('USD', 'VND')
       LIMIT 1`,
    )
    .bind(reportPeriodId)
    .first<StatementTarget>();
}

async function findStatementDeleteTarget(
  db: D1Database,
  reportPeriodId: string,
) {
  return db
    .prepare(
      `SELECT
         rp.id AS reportPeriodId,
         rp.client_id AS clientId,
         rp.period,
         rp.currency,
         rp.status,
         c.code AS clientCode,
         c.display_name AS clientName,
         s.source_upload_id AS sourceUploadId,
         u.report_period_id AS uploadReportPeriodId,
         u.object_key AS objectKey,
         u.original_filename AS filename
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       JOIN clients c
         ON c.id = rp.client_id
       LEFT JOIN uploads u
         ON u.id = s.source_upload_id
       WHERE rp.id = ?
         AND rp.currency IN ('USD', 'VND')
       LIMIT 1`,
    )
    .bind(reportPeriodId)
    .first<StatementDeleteTarget>();
}

async function isUploadStillUsed(db: D1Database, uploadId: string) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM statements
       WHERE source_upload_id = ?`,
    )
    .bind(uploadId)
    .first<{ count: number }>();

  return (Number(row?.count) || 0) > 0;
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

function parseStatementAction(value: unknown) {
  if (value === 'publish' || value === 'unpublish' || value === 'lock') {
    return value;
  }

  return null;
}

function statementStatusForAction(action: 'publish' | 'unpublish' | 'lock') {
  if (action === 'publish') return 'published';
  if (action === 'lock') return 'locked';
  return 'replaced';
}

function statementMessage(action: 'publish' | 'unpublish' | 'lock') {
  if (action === 'publish') return 'Đã publish statement.';
  if (action === 'lock') return 'Đã lock statement.';
  return 'Đã ẩn statement khỏi dashboard khách hàng.';
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-statements:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
