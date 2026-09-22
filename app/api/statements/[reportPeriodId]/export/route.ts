import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getClientPortalAccess } from '@/lib/access-control';
import { ensureUserRecord } from '@/lib/user-records';
import {
  auditStatementExport,
  contentDispositionAttachment,
  getStatementExportData,
  getOriginalStatementWorkbook,
  parseStatementExportFormat,
  statementExcelPayload,
  statementExportFilename,
  statementPdfPayload,
} from '@/lib/statement-export';

type RouteContext = {
  params: { reportPeriodId?: string } | Promise<{ reportPeriodId?: string }>;
};

export const dynamic = 'force-dynamic';
const EXPORT_PAGE_SIZE = 500;

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return jsonError('Bạn cần đăng nhập trước khi tải statement.', 401);
    }

    const access = await getClientPortalAccess(user);
    if (!access.allowed) {
      return jsonError(access.reason, access.status);
    }

    if (!env.DB) {
      return jsonError('D1 chưa sẵn sàng để xuất statement.', 503);
    }

    const params = await Promise.resolve(context.params);
    const reportPeriodId = cleanId(params.reportPeriodId);
    if (!reportPeriodId) {
      return jsonError('Thiếu mã statement.', 400);
    }

    const url = new URL(request.url);
    const format = parseStatementExportFormat(url.searchParams.get('format'));
    const offset =
      format === 'excel' ? readOffset(url.searchParams.get('offset')) : 0;
    if (offset === null) {
      return jsonError('Vị trí dữ liệu không hợp lệ.', 400);
    }
    const data = await getStatementExportData(env.DB, reportPeriodId, {
      clientId: access.clientId,
      includeBreakdowns: format === 'pdf',
      includeLineItems: false,
      publishedOnly: true,
      summaryOnly: true,
    });
    if (!data) {
      return jsonError('Không tìm thấy statement được publish.', 404);
    }

    if (offset === 0) {
      const actor = await ensureUserRecord(env.DB, {
        displayName: user.displayName,
        email: user.email,
        lastSeenAt: new Date().toISOString(),
        role: access.role === 'admin' ? 'admin' : 'client',
        userId: user.userId,
      });
      await auditStatementExport(env.DB, {
        actorUserId: actor.id,
        data,
        format,
      });
    }

    if (format === 'pdf') {
      return Response.json(
        {
          kind: 'pdf',
          data: statementPdfPayload(data),
          filename: statementExportFilename(data, format),
        },
        { headers: privateHeaders() },
      );
    }

    if (offset === 0) {
      const file = await getOriginalStatementWorkbook(data, {
        allowBulkSource: false,
        files: env.FILES,
      });
      if (file) {
        return new Response(file.body, {
          headers: {
            ...privateHeaders(),
            'Content-Disposition': contentDispositionAttachment(file.filename),
            'Content-Type': file.contentType,
          },
        });
      }
    }

    const detail = await getStatementExportData(env.DB, reportPeriodId, {
      clientId: access.clientId,
      includeBreakdowns: false,
      lineItemLimit: EXPORT_PAGE_SIZE + 1,
      lineItemOffset: offset,
      publishedOnly: true,
      summaryOnly: true,
    });
    if (!detail)
      return jsonError('Không tìm thấy statement được publish.', 404);
    if (
      offset === 0 &&
      detail.statement.rowCount > 0 &&
      !detail.lineItems.length
    ) {
      return jsonError(
        'Chưa có dữ liệu chi tiết để xuất Excel cho khách hàng này.',
        409,
      );
    }

    const payload = statementExcelPayload(detail);
    return Response.json(
      {
        kind: 'excel',
        columns: payload.columns,
        filename: statementExportFilename(data, format),
        nextOffset:
          payload.lineItems.length > EXPORT_PAGE_SIZE
            ? offset + EXPORT_PAGE_SIZE
            : null,
        rows: payload.lineItems.slice(0, EXPORT_PAGE_SIZE),
      },
      { headers: privateHeaders() },
    );
  } catch (error) {
    return serverErrorResponse(error);
  }
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function readOffset(value: string | null) {
  if (value === null) return 0;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000
    ? offset
    : null;
}

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown) {
  const errorId = crypto.randomUUID();
  console.error(`[client-statement-export:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `Không thể xuất statement lúc này. Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
