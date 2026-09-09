import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { fallbackAdminActivity, listAdminActivity } from '@/lib/admin-activity';
import { getAdminAccess } from '@/lib/admin-auth';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 20);

    if (!env.DB) {
      if (
        normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
      ) {
        return Response.json({
          activity: fallbackAdminActivity(),
          message: 'Loaded',
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc lịch sử hoạt động.', 503);
    }

    return Response.json({
      activity: await listAdminActivity(env.DB, requestedLimit),
      message: 'Loaded',
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      'Không thể tải lịch sử hoạt động lúc này.',
    );
  }
}

async function authorizeAdmin() {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false as const,
      message: 'Bạn cần đăng nhập trước khi xem lịch sử hoạt động.',
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
    user,
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-activity:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
