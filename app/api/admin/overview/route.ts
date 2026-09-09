import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  fallbackAdminOverviewData,
  getAdminOverviewData,
} from '@/lib/admin-dashboard';
import { getAdminAccess } from '@/lib/admin-auth';
import { currentCalendarMonth } from '@/lib/calendar-months';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';

const PERIOD_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return jsonError('Bạn cần đăng nhập trước khi xem dashboard admin.', 401);
    }

    const access = await getAdminAccess(user.email);
    if (!access.allowed) {
      return jsonError(access.reason, access.status);
    }

    const url = new URL(request.url);
    const requestedMonth = url.searchParams.get('period') ?? '';
    const month = PERIOD_PATTERN.test(requestedMonth)
      ? requestedMonth
      : currentCalendarMonth();

    if (!env.DB) {
      if (normalizeEmail(user.email).endsWith(LOCAL_PREVIEW_DOMAIN)) {
        return Response.json({
          overview: fallbackAdminOverviewData(month),
          message: 'Loaded',
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc dashboard admin.', 503);
    }

    return Response.json({
      overview: await getAdminOverviewData(env.DB, month),
      message: 'Loaded',
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tải dashboard admin lúc này.');
  }
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-overview:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
