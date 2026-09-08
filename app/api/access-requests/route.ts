import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { normalizeEmail } from '@/lib/access-control';

const MAX_FIELD_LENGTH = 160;
const MAX_REASON_LENGTH = 800;

type AccessRequestBody = {
  requestType?: unknown;
  companyName?: unknown;
  clientCode?: unknown;
  contactName?: unknown;
  reason?: unknown;
};

type PendingRequest = {
  id: string;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi gửi yêu cầu.', 401);
  }

  let body: AccessRequestBody;
  try {
    body = (await request.json()) as AccessRequestBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  const requestType = parseRequestType(body.requestType);
  if (!requestType) {
    return jsonError('Loại yêu cầu không hợp lệ.', 400);
  }

  const companyName = cleanText(body.companyName, MAX_FIELD_LENGTH);
  const clientCode = cleanText(body.clientCode, 48);
  const contactName = cleanText(body.contactName, MAX_FIELD_LENGTH);
  const reason = cleanText(body.reason, MAX_REASON_LENGTH);

  if (requestType === 'client_access' && !companyName && !clientCode) {
    return jsonError(
      'Yêu cầu khách hàng cần tên công ty hoặc mã client để admin đối chiếu.',
      400,
    );
  }

  if (requestType === 'admin_access' && reason.length < 12) {
    return jsonError(
      'Yêu cầu admin cần lý do rõ ràng để owner xét duyệt.',
      400,
    );
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!env.DB) {
    if (normalizedEmail.endsWith('@sites.test')) {
      return Response.json(
        {
          status: 'preview',
          message:
            'Yêu cầu đã được kiểm tra ở preview. Production sẽ ghi vào D1 và chờ admin duyệt.',
        },
        { status: 202 },
      );
    }

    return jsonError('D1 chưa sẵn sàng để lưu yêu cầu đăng ký.', 503);
  }

  const existing = await env.DB.prepare(
    `SELECT id
     FROM access_requests
     WHERE requester_user_id = ?
       AND request_type = ?
       AND status = 'pending'
     LIMIT 1`,
  )
    .bind(user.userId, requestType)
    .first<PendingRequest>();

  if (existing) {
    return Response.json({
      status: 'pending',
      requestId: existing.id,
      message: 'Bạn đã có yêu cầu cùng loại đang chờ admin duyệt.',
    });
  }

  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, display_name, role, status, created_at, last_seen_at)
       VALUES (?, ?, ?, 'pending', 'active', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`,
    ).bind(user.userId, normalizedEmail, user.displayName, now, now),
    env.DB.prepare(
      `INSERT INTO access_requests (
         id,
         requester_user_id,
         requester_email,
         request_type,
         company_name,
         client_code,
         contact_name,
         reason,
         status,
         metadata,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(
      requestId,
      user.userId,
      normalizedEmail,
      requestType,
      companyName || null,
      clientCode || null,
      contactName || null,
      reason || null,
      JSON.stringify({
        source: 'registration_page',
        grantPolicy:
          requestType === 'admin_access'
            ? 'admin_requires_server_allowlist'
            : 'client_requires_admin_assignment',
      }),
      now,
      now,
    ),
    env.DB.prepare(
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
       VALUES (?, ?, NULL, 'access_request_submitted', 'access_request', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      user.userId,
      requestId,
      JSON.stringify({
        requestType,
        requesterEmail: normalizedEmail,
      }),
      now,
    ),
  ]);

  return Response.json(
    {
      status: 'pending',
      requestId,
      message:
        'Yêu cầu đã được ghi nhận. Tài khoản chỉ có quyền sau khi admin duyệt và gán đúng vai trò.',
    },
    { status: 202 },
  );
}

function parseRequestType(value: unknown) {
  if (value === 'client_access' || value === 'admin_access') return value;
  return null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
