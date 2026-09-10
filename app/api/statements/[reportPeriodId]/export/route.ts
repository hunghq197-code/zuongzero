import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getClientPortalAccess } from '@/lib/access-control';
import { ensureUserRecord } from '@/lib/user-records';
import {
  auditStatementExport,
  buildStatementExportFile,
  getStatementExportData,
  parseStatementExportFormat,
  statementExportFilename,
} from '@/lib/statement-export';

type RouteContext = {
  params: { reportPeriodId?: string } | Promise<{ reportPeriodId?: string }>;
};

export const dynamic = 'force-dynamic';

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
    const data = await getStatementExportData(env.DB, reportPeriodId, {
      clientId: access.clientId,
      publishedOnly: true,
    });
    if (!data) {
      return jsonError('Không tìm thấy statement được publish.', 404);
    }

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

    const file = buildStatementExportFile(data, format);
    return new Response(file.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${statementExportFilename(data, format)}"`,
        'Content-Type': file.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
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
