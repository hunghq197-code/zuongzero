import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { normalizeEmail } from '@/lib/access-control';
import { getAdminAccess } from '@/lib/admin-auth';

type AccessRequestRow = {
  id: string;
  requesterEmail: string;
  requestType: 'client_access' | 'admin_access';
  companyName: string | null;
  clientCode: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
};

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi xem yêu cầu.', 401);
  }

  const access = getAdminAccess(user.email);
  if (!access.allowed) {
    return jsonError(access.reason, access.status);
  }

  if (!env.DB) {
    if (normalizeEmail(user.email).endsWith('@sites.test')) {
      return Response.json({
        requests: [],
        message: 'Preview chưa có D1. Production sẽ hiển thị request thật.',
      });
    }

    return jsonError('D1 chưa sẵn sàng để đọc yêu cầu đăng ký.', 503);
  }

  const result = await env.DB.prepare(
    `SELECT
       id,
       requester_email AS requesterEmail,
       request_type AS requestType,
       company_name AS companyName,
       client_code AS clientCode,
       status,
       created_at AS createdAt
     FROM access_requests
     ORDER BY created_at DESC
     LIMIT 25`,
  ).all<AccessRequestRow>();

  return Response.json({
    requests: result.results,
    message: 'Loaded',
  });
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
