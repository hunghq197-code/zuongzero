import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';

type UploadHistoryDbRow = {
  byteSize: number;
  createdAt: string;
  filename: string;
  id: string;
  isCurrent: number;
  replacedUploadId: string | null;
  sha256: string;
  status: 'imported' | 'rolled_back';
  uploaderEmail: string | null;
  validationSummary: string | null;
};

type StatementTarget = {
  clientId: string;
  hasNewerActiveUpload: number;
  paymentStatus: 'paid' | 'unpaid';
  period: string;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { message: 'Bạn cần đăng nhập trước khi xem lịch sử import.' },
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

    if (!env.DB) {
      return Response.json({ message: 'D1 chưa sẵn sàng.' }, { status: 503 });
    }

    const reportPeriodId = new URL(request.url).searchParams
      .get('reportPeriodId')
      ?.trim();
    if (!reportPeriodId) {
      return Response.json(
        { message: 'Thiếu statement cần xem lịch sử.' },
        { status: 400 },
      );
    }

    const target = await env.DB.prepare(
      `SELECT
         report_periods.client_id AS clientId,
         report_periods.period,
         report_periods.status,
         report_periods.payment_status AS paymentStatus,
         EXISTS (
           SELECT 1
           FROM uploads newer_upload
           JOIN uploads current_upload
             ON current_upload.id = current_statement.source_upload_id
           WHERE newer_upload.client_id = report_periods.client_id
             AND newer_upload.id <> current_upload.id
             AND newer_upload.status = 'imported'
             AND newer_upload.created_at > current_upload.created_at
         ) AS hasNewerActiveUpload
       FROM report_periods
       LEFT JOIN statements current_statement
         ON current_statement.report_period_id = report_periods.id
       WHERE report_periods.id = ?
         AND report_periods.currency = 'VND'
       LIMIT 1`,
    )
      .bind(reportPeriodId)
      .first<StatementTarget>();

    if (!target) {
      return Response.json(
        { message: 'Không tìm thấy statement.' },
        { status: 404 },
      );
    }

    const rows = await env.DB.prepare(
      `SELECT
         u.id,
         u.original_filename AS filename,
         u.byte_size AS byteSize,
         u.sha256,
         u.status,
         u.validation_summary AS validationSummary,
         u.replaced_upload_id AS replacedUploadId,
         u.created_at AS createdAt,
         creator.email AS uploaderEmail,
         CASE WHEN current_statement.source_upload_id = u.id THEN 1 ELSE 0 END AS isCurrent
       FROM uploads u
       JOIN report_periods upload_period
         ON upload_period.id = u.report_period_id
       LEFT JOIN users creator
         ON creator.id = u.uploaded_by_user_id
       LEFT JOIN statements current_statement
         ON current_statement.report_period_id = ?
       WHERE u.client_id = ?
         AND upload_period.period = ?
         AND u.status IN ('imported', 'rolled_back')
       ORDER BY u.created_at DESC
       LIMIT 50`,
    )
      .bind(reportPeriodId, target.clientId, target.period)
      .all<UploadHistoryDbRow>();

    return Response.json({
      history: rows.results.map((row) => {
        const summary = parseSummary(row.validationSummary);
        const rollbackSnapshotKey = readSummaryText(
          summary,
          'rollbackSnapshotKey',
        );
        const isCurrent = Boolean(row.isCurrent);

        return {
          byteSize: Number(row.byteSize) || 0,
          canRollback:
            isCurrent &&
            row.status === 'imported' &&
            !target.hasNewerActiveUpload &&
            Boolean(rollbackSnapshotKey) &&
            target.status !== 'locked' &&
            target.paymentStatus !== 'paid',
          createdAt: row.createdAt,
          filename: row.filename,
          id: row.id,
          importStrategy:
            readSummaryText(summary, 'importStrategy') ?? 'create',
          isCurrent,
          replacedUploadId: row.replacedUploadId,
          rowCount: readSummaryNumber(summary, 'rowCount'),
          sha256: row.sha256,
          status: row.status,
          uploadMode: readSummaryText(summary, 'uploadMode') ?? 'single',
          uploaderEmail: row.uploaderEmail,
        };
      }),
      paymentStatus: target.paymentStatus,
      reportPeriodId,
      rollbackBlockedByNewerImport: Boolean(target.hasNewerActiveUpload),
      statementStatus: target.status,
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[admin-upload-history:${errorId}]`, error);
    return Response.json(
      {
        errorId,
        message: `Không thể tải lịch sử import. Mã lỗi ${errorId}.`,
      },
      { status: 500 },
    );
  }
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

function readSummaryNumber(
  summary: Record<string, unknown> | null,
  key: string,
) {
  const value = Number(summary?.[key]);
  return Number.isFinite(value) ? value : 0;
}
