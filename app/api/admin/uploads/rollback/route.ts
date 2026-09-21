import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { ensureUserRecord } from '@/lib/user-records';
import {
  parseStatementImportSnapshot,
  restoreStatementImportSnapshot,
} from '@/lib/statement-import-snapshots';

type RollbackTarget = {
  clientId: string;
  currentUploadCreatedAt: string;
  currentUploadId: string;
  paymentStatus: 'paid' | 'unpaid';
  period: string;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
  validationSummary: string | null;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { message: 'Bạn cần đăng nhập trước khi hoàn tác.' },
        { status: 401 },
      );
    }

    const access = await getAdminAccess(user.email);
    if (!access.allowed) {
      return Response.json(
        { message: access.reason },
        { status: access.status },
      );
    }

    if (!env.DB || !env.FILES) {
      return Response.json(
        { message: 'D1/R2 chưa sẵn sàng cho hoàn tác.' },
        { status: 503 },
      );
    }

    const body = await readJsonBody(request);
    const reportPeriodId = readBodyText(body, 'reportPeriodId');
    const uploadId = readBodyText(body, 'uploadId');
    if (!reportPeriodId || !uploadId) {
      return Response.json(
        { message: 'Thiếu statement hoặc phiên bản cần hoàn tác.' },
        { status: 400 },
      );
    }

    const target = await env.DB.prepare(
      `SELECT
         rp.client_id AS clientId,
         rp.period,
         rp.status,
         rp.payment_status AS paymentStatus,
         s.source_upload_id AS currentUploadId,
         u.created_at AS currentUploadCreatedAt,
         u.validation_summary AS validationSummary
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       JOIN uploads u
         ON u.id = s.source_upload_id
       WHERE rp.id = ?
         AND rp.currency = 'VND'
       LIMIT 1`,
    )
      .bind(reportPeriodId)
      .first<RollbackTarget>();

    if (!target) {
      return Response.json(
        { message: 'Không tìm thấy statement đang hoạt động.' },
        { status: 404 },
      );
    }

    if (target.currentUploadId !== uploadId) {
      return Response.json(
        {
          message:
            'Phiên bản này không còn là dữ liệu hiện tại. Hãy tải lại lịch sử trước khi hoàn tác.',
        },
        { status: 409 },
      );
    }

    if (target.status === 'locked') {
      return Response.json(
        { message: 'Statement đang khóa. Hãy mở khóa trước khi hoàn tác.' },
        { status: 409 },
      );
    }

    if (target.paymentStatus === 'paid') {
      return Response.json(
        {
          message:
            'Statement đã thanh toán. Hãy hoàn tác trạng thái thanh toán trước khi hoàn tác dữ liệu.',
        },
        { status: 409 },
      );
    }

    const newerActiveUpload = await env.DB.prepare(
      `SELECT id
       FROM uploads
       WHERE client_id = ?
         AND id <> ?
         AND status = 'imported'
         AND created_at > ?
       LIMIT 1`,
    )
      .bind(target.clientId, uploadId, target.currentUploadCreatedAt)
      .first<{ id: string }>();
    if (newerActiveUpload) {
      return Response.json(
        {
          message:
            'Khách hàng này có lần nhập mới hơn. Hãy hoàn tác phiên bản mới nhất trước để bảo toàn số dư GM.',
        },
        { status: 409 },
      );
    }

    const summary = parseSummary(target.validationSummary);
    const snapshotKey = readSummaryText(summary, 'rollbackSnapshotKey');
    if (!snapshotKey) {
      return Response.json(
        { message: 'Phiên bản này không có snapshot để hoàn tác.' },
        { status: 409 },
      );
    }

    const snapshotObject = await env.FILES.get(snapshotKey);
    if (!snapshotObject) {
      return Response.json(
        { message: 'Không tìm thấy snapshot hoàn tác trong kho file.' },
        { status: 409 },
      );
    }

    const snapshot = parseSnapshotText(await snapshotObject.text(), {
      clientId: target.clientId,
      period: target.period,
      reportPeriodId,
    });
    if (!snapshot) {
      return Response.json(
        {
          message: 'Snapshot hoàn tác không hợp lệ hoặc không đúng statement.',
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const actor = await ensureUserRecord(env.DB, {
      displayName: user.displayName,
      email: user.email,
      lastSeenAt: now,
      role: access.role,
      userId: user.userId,
    });

    await restoreStatementImportSnapshot(env.DB, snapshot);
    const finalStatements = [
      env.DB.prepare(
        `UPDATE uploads
         SET status = 'rolled_back'
         WHERE id = ?`,
      ).bind(uploadId),
    ];
    if (snapshot.statement?.sourceUploadId) {
      finalStatements.push(
        env.DB.prepare(
          `UPDATE uploads
           SET status = 'imported'
           WHERE id = ?`,
        ).bind(snapshot.statement.sourceUploadId),
      );
    }
    finalStatements.push(
      env.DB.prepare(
        `INSERT INTO audit_logs (
           id, actor_user_id, client_id, action, target_type, target_id,
           metadata, created_at
         )
         VALUES (?, ?, ?, 'admin_statement_upload_rolled_back', 'upload', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        actor.id,
        target.clientId,
        uploadId,
        JSON.stringify({
          period: target.period,
          restoredUploadId: snapshot.statement?.sourceUploadId ?? null,
          rolledBackUploadId: uploadId,
          snapshotCapturedAt: snapshot.capturedAt,
          snapshotKey,
        }),
        now,
      ),
    );
    await env.DB.batch(finalStatements);

    return Response.json({
      message: snapshot.statement
        ? 'Đã hoàn tác về phiên bản statement trước đó.'
        : 'Đã hoàn tác lần tạo statement; kỳ này trở về trạng thái chưa có dữ liệu.',
      restoredUploadId: snapshot.statement?.sourceUploadId ?? null,
      status: 'rolled_back',
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[admin-upload-rollback:${errorId}]`, error);
    return Response.json(
      {
        errorId,
        message: `Không thể hoàn tác dữ liệu. Mã lỗi ${errorId}.`,
      },
      { status: 500 },
    );
  }
}

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readBodyText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function parseSummary(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readSummaryText(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === 'string' && value ? value : null;
}

function parseSnapshotText(
  value: string,
  expected: { clientId: string; period: string; reportPeriodId: string },
) {
  try {
    return parseStatementImportSnapshot(JSON.parse(value), expected);
  } catch {
    return null;
  }
}
