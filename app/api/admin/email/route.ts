import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { getEmailProductionStatus } from '@/lib/email-production';
import { sendProductionTestEmail } from '@/lib/email';
import { ensureUserRecord } from '@/lib/user-records';

type EmailBody = {
  action?: unknown;
  to?: unknown;
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

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    return Response.json({
      message: 'Loaded',
      status: await getEmailProductionStatus(env),
      testRecipient: authorization.user.email,
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể kiểm tra email production.');
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    const body = await readEmailBody(request);
    if (!body) return jsonError('Payload không hợp lệ.', 400);
    if (body.action !== 'send_test') {
      return jsonError('Hành động email không hợp lệ.', 400);
    }

    const recipientEmail = normalizeEmail(body.to) || authorization.user.email;
    if (!recipientEmail) {
      return jsonError('Email nhận test không hợp lệ.', 400);
    }

    const status = await getEmailProductionStatus(env);
    const delivery = await sendProductionTestEmail(
      {
        portalUrl: status.portalUrl,
        recipientEmail,
        requestedByEmail: authorization.user.email,
      },
      env,
    );

    if (env.DB) {
      const now = new Date().toISOString();
      const actor = await ensureUserRecord(env.DB, {
        displayName: authorization.user.displayName,
        email: authorization.user.email,
        lastSeenAt: now,
        role: authorization.role,
        userId: authorization.user.userId,
      });

      await env.DB.prepare(
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
         VALUES (?, ?, NULL, 'email_test_sent', 'email', ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          actor.id,
          recipientEmail,
          JSON.stringify({
            domain: status.fromDomain,
            emailStatus: delivery.status,
            fromAddress: status.fromAddress,
            recipientEmail,
            sendingReady: status.sendingReady,
          }),
          now,
        )
        .run();
    }

    if (delivery.status !== 'sent') {
      return Response.json(
        {
          message:
            delivery.status === 'not_configured'
              ? 'Email production chưa cấu hình đủ RESEND_API_KEY/EMAIL_FROM.'
              : delivery.message,
          status: await getEmailProductionStatus(env),
        },
        { status: delivery.status === 'not_configured' ? 503 : 502 },
      );
    }

    return Response.json({
      message: `Đã gửi email test tới ${recipientEmail}.`,
      status: await getEmailProductionStatus(env),
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể gửi email test lúc này.');
  }
}

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false,
      message: 'Bạn cần đăng nhập trước khi kiểm tra email production.',
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

async function readEmailBody(request: Request): Promise<EmailBody | null> {
  try {
    return (await request.json()) as EmailBody;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-email:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
