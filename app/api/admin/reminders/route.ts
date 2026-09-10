import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import {
  hasSettlementReminderTables,
  listSettlementReminderDeliveries,
  listSettlementReminderRecipients,
  listSettlementReminderRuns,
  runSettlementReminderJob,
} from '@/lib/settlement-reminders';
import {
  currentCalendarQuarter,
  REPORT_PERIOD_PATTERN,
} from '@/lib/reporting-periods';
import { ensureUserRecord } from '@/lib/user-records';

type ReminderBody = {
  action?: unknown;
  period?: unknown;
  retryRunId?: unknown;
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

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    if (!env.DB) {
      return Response.json({
        deliveries: [],
        message: 'D1 chưa sẵn sàng để đọc reminder.',
        recipients: [],
        runs: [],
        tablesReady: false,
      });
    }

    const url = new URL(request.url);
    const period = normalizePeriod(url.searchParams.get('period'));
    const runId = cleanId(url.searchParams.get('runId'));

    if (!(await hasSettlementReminderTables(env.DB))) {
      return Response.json({
        deliveries: [],
        message:
          'D1 chưa áp migration nhắc đối soát. Sau khi deploy migration, tab này sẽ hoạt động.',
        recipients: [],
        runs: [],
        tablesReady: false,
      });
    }

    const [recipients, runs, deliveries] = await Promise.all([
      listSettlementReminderRecipients(env.DB, period),
      listSettlementReminderRuns(env.DB),
      runId ? listSettlementReminderDeliveries(env.DB, runId) : [],
    ]);

    return Response.json({
      deliveries,
      message: 'Loaded',
      recipients,
      runs,
      tablesReady: true,
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      'Không thể tải danh sách nhắc đối soát lúc này.',
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    if (!env.DB) {
      return jsonError('D1 chưa sẵn sàng để chạy reminder.', 503);
    }

    if (!(await hasSettlementReminderTables(env.DB))) {
      return jsonError(
        'D1 chưa áp migration nhắc đối soát. Hãy chạy migration Phase 4 trước.',
        503,
      );
    }

    const body = await readReminderBody(request);
    if (!body) return jsonError('Payload không hợp lệ.', 400);

    const action = parseAction(body.action);
    if (!action) return jsonError('Hành động reminder không hợp lệ.', 400);

    const period = normalizePeriod(body.period);
    const retryRunId = cleanId(body.retryRunId);
    if (action === 'retry_failed' && !retryRunId) {
      return jsonError('Cần chọn lần gửi để retry.', 400);
    }

    const now = new Date();
    const actor = await ensureUserRecord(env.DB, {
      displayName: authorization.user.displayName,
      email: authorization.user.email,
      lastSeenAt: now.toISOString(),
      role: authorization.role,
      userId: authorization.user.userId,
    });

    const result = await runSettlementReminderJob({
      actorUserId: actor.id,
      db: env.DB,
      now,
      period,
      requestUrl: request.url,
      retryRunId: action === 'retry_failed' ? retryRunId : undefined,
      runType:
        action === 'dry_run'
          ? 'dry_run'
          : action === 'retry_failed'
            ? 'retry'
            : 'manual',
      runtimeEnv: env,
    });
    const [recipients, runs] = await Promise.all([
      listSettlementReminderRecipients(env.DB, period),
      listSettlementReminderRuns(env.DB),
    ]);

    return Response.json({
      message: successMessage(action, result.run),
      recipients,
      run: result.run,
      runs,
      tablesReady: true,
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể chạy reminder lúc này.');
  }
}

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false,
      message: 'Bạn cần đăng nhập trước khi quản lý reminder.',
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

async function readReminderBody(
  request: Request,
): Promise<ReminderBody | null> {
  try {
    return (await request.json()) as ReminderBody;
  } catch {
    return null;
  }
}

function parseAction(value: unknown) {
  if (value === 'dry_run' || value === 'send' || value === 'retry_failed') {
    return value;
  }

  return null;
}

function normalizePeriod(value: unknown) {
  if (typeof value === 'string' && REPORT_PERIOD_PATTERN.test(value)) {
    return value;
  }

  return currentCalendarQuarter();
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function successMessage(
  action: 'dry_run' | 'send' | 'retry_failed',
  run: { failedCount: number; notConfiguredCount: number; sentCount: number },
) {
  if (action === 'dry_run') {
    return 'Dry-run hoàn tất. Chưa có email nào được gửi.';
  }

  if (run.notConfiguredCount > 0) {
    return 'Reminder chưa gửi được vì email production chưa cấu hình đủ.';
  }

  if (run.failedCount > 0) {
    return 'Reminder đã chạy nhưng còn email lỗi. Có thể retry sau.';
  }

  return `Đã gửi ${run.sentCount} email nhắc đối soát.`;
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-reminders:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
