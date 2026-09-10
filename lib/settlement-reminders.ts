import { sendSettlementReminderEmail, type EmailRuntimeEnv } from '@/lib/email';
import {
  currentCalendarQuarter,
  DASHBOARD_TIME_ZONE,
  periodDisplayLabel,
  REPORT_PERIOD_PATTERN,
} from '@/lib/reporting-periods';
import { summarizeSettlement } from '@/lib/settlements';

const DEFAULT_PORTAL_URL = 'https://artistportal.zuongzeroent.com';

export const SETTLEMENT_REMINDER_CRON = '0 2 15 * *';
export const SETTLEMENT_REMINDER_DAY = 15;

export type SettlementReminderRuntimeEnv = EmailRuntimeEnv & {
  APP_BASE_URL?: string;
  DB?: D1Database;
};

export type SettlementReminderRunType =
  | 'scheduled'
  | 'manual'
  | 'dry_run'
  | 'retry';

export type SettlementReminderRunStatus =
  | 'completed'
  | 'partial'
  | 'failed'
  | 'skipped';

export type SettlementReminderDeliveryStatus =
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'not_configured'
  | 'dry_run';

export type SettlementReminderRecipient = {
  accessLevel: string;
  canSend: boolean;
  carryForward: number;
  clientCode: string;
  clientId: string;
  clientName: string;
  displayName: string | null;
  email: string;
  latestPublishedAt: string | null;
  paidAmount: number;
  payable: number;
  period: string;
  periodLabel: string;
  settlementStatus: 'paid' | 'carried_forward' | 'no_statement';
  statementStatus: 'published' | 'locked' | 'missing';
  userId: string;
};

export type SettlementReminderRun = {
  createdAt: string;
  errorSummary: string | null;
  failedCount: number;
  id: string;
  metadata: Record<string, unknown> | null;
  notConfiguredCount: number;
  period: string;
  periodLabel: string;
  reminderDate: string;
  requestedByUserId: string | null;
  runType: SettlementReminderRunType;
  sentCount: number;
  skippedCount: number;
  status: SettlementReminderRunStatus;
  targetCount: number;
  updatedAt: string;
};

export type SettlementReminderDeliveryLog = {
  clientCode: string | null;
  clientId: string;
  clientName: string | null;
  createdAt: string;
  email: string;
  errorMessage: string | null;
  id: string;
  period: string;
  reason: string | null;
  runId: string;
  sentAt: string | null;
  status: SettlementReminderDeliveryStatus;
  userId: string;
};

type RecipientSqlRow = {
  accessLevel: string;
  clientCode: string;
  clientId: string;
  clientName: string;
  displayName: string | null;
  email: string;
  lockedAt: string | null;
  opening: number | null;
  period: string;
  publishedAt: string | null;
  reportPeriodId: string | null;
  reservesReleased: number | null;
  reservesWithheld: number | null;
  rowCount: number | null;
  costs: number | null;
  revenue: number | null;
  statementId: string | null;
  statementStatus: 'published' | 'locked' | null;
  userId: string;
};

type RunSqlRow = Omit<SettlementReminderRun, 'metadata' | 'periodLabel'> & {
  metadata: string | null;
};

type DeliverySqlRow = SettlementReminderDeliveryLog & {
  clientCode: string | null;
  clientName: string | null;
};

export async function hasSettlementReminderTables(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
         AND name IN ('settlement_reminder_runs', 'settlement_reminder_deliveries')`,
    )
    .all<{ name: string }>();

  return new Set(rows.results.map((row) => row.name)).size === 2;
}

export async function listSettlementReminderRecipients(
  db: D1Database,
  period: string,
): Promise<SettlementReminderRecipient[]> {
  const rows = await db
    .prepare(
      `SELECT
         c.id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         u.id AS userId,
         u.email,
         u.display_name AS displayName,
         cu.access_level AS accessLevel,
         ? AS period,
         rp.id AS reportPeriodId,
         rp.status AS statementStatus,
         rp.published_at AS publishedAt,
         rp.locked_at AS lockedAt,
         s.id AS statementId,
         s.opening_balance AS opening,
         s.net_revenue AS revenue,
         s.net_costs AS costs,
         s.reserves_withheld AS reservesWithheld,
         s.reserves_released AS reservesReleased,
         s.row_count AS rowCount
       FROM clients c
       JOIN client_users cu
         ON cu.client_id = c.id
        AND cu.status = 'active'
       JOIN users u
         ON u.id = cu.user_id
        AND u.status = 'active'
        AND u.role = 'client'
       LEFT JOIN report_periods rp
         ON rp.client_id = c.id
        AND rp.period = ?
        AND rp.currency = 'VND'
        AND rp.status IN ('published', 'locked')
       LEFT JOIN statements s
         ON s.report_period_id = rp.id
       WHERE c.status = 'active'
       ORDER BY c.display_name ASC, u.email ASC`,
    )
    .bind(period, period)
    .all<RecipientSqlRow>();

  return rows.results.map((row) => mapRecipientRow(row, period));
}

export async function listSettlementReminderRuns(
  db: D1Database,
  limit = 10,
): Promise<SettlementReminderRun[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50);
  const rows = await db
    .prepare(
      `SELECT
         id,
         period,
         reminder_date AS reminderDate,
         run_type AS runType,
         status,
         requested_by_user_id AS requestedByUserId,
         target_count AS targetCount,
         sent_count AS sentCount,
         skipped_count AS skippedCount,
         failed_count AS failedCount,
         not_configured_count AS notConfiguredCount,
         error_summary AS errorSummary,
         metadata,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM settlement_reminder_runs
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<RunSqlRow>();

  return rows.results.map(mapRunRow);
}

export async function listSettlementReminderDeliveries(
  db: D1Database,
  runId: string,
): Promise<SettlementReminderDeliveryLog[]> {
  const rows = await db
    .prepare(
      `SELECT
         d.id,
         d.run_id AS runId,
         d.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         d.user_id AS userId,
         d.email,
         d.period,
         d.status,
         d.reason,
         d.error_message AS errorMessage,
         d.sent_at AS sentAt,
         d.created_at AS createdAt
       FROM settlement_reminder_deliveries d
       LEFT JOIN clients c
         ON c.id = d.client_id
       WHERE d.run_id = ?
       ORDER BY d.created_at DESC`,
    )
    .bind(runId)
    .all<DeliverySqlRow>();

  return rows.results.map((row) => ({
    ...row,
    status: row.status,
  }));
}

export async function runSettlementReminderJob(input: {
  actorUserId?: string | null;
  db: D1Database;
  now?: Date;
  period?: string;
  requestUrl?: string;
  retryRunId?: string;
  runType: SettlementReminderRunType;
  runtimeEnv?: SettlementReminderRuntimeEnv;
}) {
  if (!(await hasSettlementReminderTables(input.db))) {
    throw new Error('D1 chưa có bảng log nhắc đối soát.');
  }

  const now = input.now ?? new Date();
  const localDate = dashboardDate(now);
  const period = normalizePeriod(input.period, now);
  const recipients =
    input.runType === 'retry' && input.retryRunId
      ? await listRetryRecipients(input.db, input.retryRunId)
      : await listSettlementReminderRecipients(input.db, period);
  const runId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const portalUrl = settlementPortalUrl(input.runtimeEnv, input.requestUrl);

  await input.db
    .prepare(
      `INSERT INTO settlement_reminder_runs (
         id,
         period,
         reminder_date,
         run_type,
         status,
         requested_by_user_id,
         target_count,
         sent_count,
         skipped_count,
         failed_count,
         not_configured_count,
         metadata,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, 'skipped', ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
    )
    .bind(
      runId,
      period,
      localDate.date,
      input.runType,
      input.actorUserId ?? null,
      recipients.length,
      JSON.stringify({
        portalUrl,
        retryRunId: input.retryRunId ?? null,
        timezone: DASHBOARD_TIME_ZONE,
      }),
      nowIso,
      nowIso,
    )
    .run();

  let failedCount = 0;
  let notConfiguredCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const deliveryId = crypto.randomUUID();
    let status: SettlementReminderDeliveryStatus = 'skipped';
    let reason: string | null = null;
    let errorMessage: string | null = null;
    let sentAt: string | null = null;

    if (!recipient.canSend) {
      skippedCount += 1;
      reason = 'no_published_statement';
    } else if (input.runType === 'dry_run') {
      status = 'dry_run';
      reason = 'preview_only';
    } else {
      const delivery = await sendSettlementReminderEmail(
        {
          carryForward: recipient.carryForward,
          clientCode: recipient.clientCode,
          clientName: recipient.clientName,
          displayName: recipient.displayName,
          email: recipient.email,
          paidAmount: recipient.paidAmount,
          payable: recipient.payable,
          periodLabel: recipient.periodLabel,
          portalUrl,
          settlementStatus:
            recipient.settlementStatus === 'paid' ? 'paid' : 'carried_forward',
        },
        input.runtimeEnv,
      );

      if (delivery.status === 'sent') {
        status = 'sent';
        sentAt = new Date().toISOString();
        sentCount += 1;
      } else if (delivery.status === 'not_configured') {
        status = 'not_configured';
        notConfiguredCount += 1;
        errorMessage = 'RESEND_API_KEY hoặc EMAIL_FROM chưa được cấu hình.';
        errors.push(errorMessage);
      } else {
        status = 'failed';
        failedCount += 1;
        errorMessage = delivery.message;
        errors.push(`${recipient.email}: ${delivery.message}`);
      }
    }

    await input.db
      .prepare(
        `INSERT INTO settlement_reminder_deliveries (
           id,
           run_id,
           client_id,
           user_id,
           email,
           period,
           status,
           reason,
           error_message,
           sent_at,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        deliveryId,
        runId,
        recipient.clientId,
        recipient.userId,
        recipient.email,
        recipient.period,
        status,
        reason,
        errorMessage,
        sentAt,
        nowIso,
      )
      .run();
  }

  const status = runStatus({
    failedCount,
    notConfiguredCount,
    runType: input.runType,
    sentCount,
    skippedCount,
    targetCount: recipients.length,
  });
  const errorSummary = compactErrorSummary(errors);
  const updatedAt = new Date().toISOString();

  await input.db
    .prepare(
      `UPDATE settlement_reminder_runs
       SET status = ?,
           sent_count = ?,
           skipped_count = ?,
           failed_count = ?,
           not_configured_count = ?,
           error_summary = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      status,
      sentCount,
      skippedCount,
      failedCount,
      notConfiguredCount,
      errorSummary,
      updatedAt,
      runId,
    )
    .run();

  if (input.actorUserId) {
    await createAuditLog(input.db, {
      actorUserId: input.actorUserId,
      action:
        input.runType === 'dry_run'
          ? 'settlement_reminder_dry_run'
          : input.runType === 'retry'
            ? 'settlement_reminder_retry'
            : 'settlement_reminder_sent',
      metadata: {
        failedCount,
        notConfiguredCount,
        period,
        runType: input.runType,
        sentCount,
        skippedCount,
        targetCount: recipients.length,
      },
      runId,
      timestamp: updatedAt,
    });
  }

  const run = await findSettlementReminderRun(input.db, runId);

  return {
    recipients,
    run: run ?? {
      createdAt: nowIso,
      errorSummary,
      failedCount,
      id: runId,
      metadata: null,
      notConfiguredCount,
      period,
      periodLabel: periodDisplayLabel(period),
      reminderDate: localDate.date,
      requestedByUserId: input.actorUserId ?? null,
      runType: input.runType,
      sentCount,
      skippedCount,
      status,
      targetCount: recipients.length,
      updatedAt,
    },
  };
}

export async function runScheduledSettlementReminder(
  runtimeEnv: SettlementReminderRuntimeEnv,
  now = new Date(),
) {
  const db = runtimeEnv.DB;
  if (!db) {
    console.error('[settlement-reminder] DB binding is unavailable');
    return null;
  }

  if (!(await hasSettlementReminderTables(db))) {
    console.error('[settlement-reminder] reminder tables are unavailable');
    return null;
  }

  const localDate = dashboardDate(now);
  if (localDate.day !== SETTLEMENT_REMINDER_DAY) {
    return null;
  }

  const period = currentCalendarQuarter(now);
  const existingRun = await db
    .prepare(
      `SELECT id
       FROM settlement_reminder_runs
       WHERE period = ?
         AND reminder_date = ?
         AND run_type = 'scheduled'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(period, localDate.date)
    .first<{ id: string }>();

  if (existingRun) return existingRun;

  return runSettlementReminderJob({
    db,
    now,
    period,
    runType: 'scheduled',
    runtimeEnv,
  });
}

async function findSettlementReminderRun(db: D1Database, runId: string) {
  const row = await db
    .prepare(
      `SELECT
         id,
         period,
         reminder_date AS reminderDate,
         run_type AS runType,
         status,
         requested_by_user_id AS requestedByUserId,
         target_count AS targetCount,
         sent_count AS sentCount,
         skipped_count AS skippedCount,
         failed_count AS failedCount,
         not_configured_count AS notConfiguredCount,
         error_summary AS errorSummary,
         metadata,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM settlement_reminder_runs
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(runId)
    .first<RunSqlRow>();

  return row ? mapRunRow(row) : null;
}

async function listRetryRecipients(
  db: D1Database,
  runId: string,
): Promise<SettlementReminderRecipient[]> {
  const rows = await db
    .prepare(
      `SELECT
         c.id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         u.id AS userId,
         u.email,
         u.display_name AS displayName,
         cu.access_level AS accessLevel,
         d.period,
         rp.id AS reportPeriodId,
         rp.status AS statementStatus,
         rp.published_at AS publishedAt,
         rp.locked_at AS lockedAt,
         s.id AS statementId,
         s.opening_balance AS opening,
         s.net_revenue AS revenue,
         s.net_costs AS costs,
         s.reserves_withheld AS reservesWithheld,
         s.reserves_released AS reservesReleased,
         s.row_count AS rowCount
       FROM settlement_reminder_deliveries d
       JOIN clients c
         ON c.id = d.client_id
        AND c.status = 'active'
       JOIN users u
         ON u.id = d.user_id
        AND u.status = 'active'
        AND u.role = 'client'
       JOIN client_users cu
         ON cu.client_id = c.id
        AND cu.user_id = u.id
        AND cu.status = 'active'
       LEFT JOIN report_periods rp
         ON rp.client_id = c.id
        AND rp.period = d.period
        AND rp.currency = 'VND'
        AND rp.status IN ('published', 'locked')
       LEFT JOIN statements s
         ON s.report_period_id = rp.id
       WHERE d.run_id = ?
         AND d.status IN ('failed', 'not_configured')
       ORDER BY c.display_name ASC, u.email ASC`,
    )
    .bind(runId)
    .all<RecipientSqlRow>();

  return rows.results.map((row) => mapRecipientRow(row, row.period));
}

function mapRecipientRow(
  row: RecipientSqlRow,
  period: string,
): SettlementReminderRecipient {
  if (!row.statementId || !row.reportPeriodId) {
    return {
      accessLevel: row.accessLevel,
      canSend: false,
      carryForward: 0,
      clientCode: row.clientCode,
      clientId: row.clientId,
      clientName: row.clientName,
      displayName: row.displayName,
      email: row.email,
      latestPublishedAt: null,
      paidAmount: 0,
      payable: 0,
      period,
      periodLabel: periodDisplayLabel(period),
      settlementStatus: 'no_statement',
      statementStatus: 'missing',
      userId: row.userId,
    };
  }

  const settlement = summarizeSettlement({
    costs: Number(row.costs) || 0,
    opening: Number(row.opening) || 0,
    reservesReleased: Number(row.reservesReleased) || 0,
    reservesWithheld: Number(row.reservesWithheld) || 0,
    revenue: Number(row.revenue) || 0,
  });

  return {
    accessLevel: row.accessLevel,
    canSend: true,
    carryForward: settlement.carryForward,
    clientCode: row.clientCode,
    clientId: row.clientId,
    clientName: row.clientName,
    displayName: row.displayName,
    email: row.email,
    latestPublishedAt: row.publishedAt ?? row.lockedAt,
    paidAmount: settlement.paidAmount,
    payable: settlement.payable,
    period,
    periodLabel: periodDisplayLabel(period),
    settlementStatus: settlement.status,
    statementStatus: row.statementStatus ?? 'published',
    userId: row.userId,
  };
}

function mapRunRow(row: RunSqlRow): SettlementReminderRun {
  return {
    ...row,
    failedCount: Number(row.failedCount) || 0,
    metadata: parseMetadata(row.metadata),
    notConfiguredCount: Number(row.notConfiguredCount) || 0,
    periodLabel: periodDisplayLabel(row.period),
    sentCount: Number(row.sentCount) || 0,
    skippedCount: Number(row.skippedCount) || 0,
    targetCount: Number(row.targetCount) || 0,
  };
}

function normalizePeriod(period: string | undefined, now: Date) {
  return period && REPORT_PERIOD_PATTERN.test(period)
    ? period
    : currentCalendarQuarter(now);
}

function runStatus(input: {
  failedCount: number;
  notConfiguredCount: number;
  runType: SettlementReminderRunType;
  sentCount: number;
  skippedCount: number;
  targetCount: number;
}): SettlementReminderRunStatus {
  if (input.targetCount === 0) return 'skipped';
  if (input.runType === 'dry_run') return 'completed';

  const blockedCount = input.failedCount + input.notConfiguredCount;
  if (blockedCount > 0 && input.sentCount > 0) return 'partial';
  if (blockedCount > 0) return 'failed';
  if (input.sentCount === 0 && input.skippedCount === input.targetCount) {
    return 'skipped';
  }

  return 'completed';
}

function compactErrorSummary(errors: string[]) {
  if (errors.length === 0) return null;

  return [...new Set(errors)].slice(0, 5).join(' | ');
}

function dashboardDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    day: '2-digit',
    month: '2-digit',
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const dayText = parts.find((part) => part.type === 'day')?.value ?? '';

  return {
    date: `${year}-${month}-${dayText}`,
    day: Number(dayText),
  };
}

function settlementPortalUrl(
  runtimeEnv: SettlementReminderRuntimeEnv | undefined,
  requestUrl: string | undefined,
) {
  const baseUrl =
    cleanBaseUrl(runtimeEnv?.APP_BASE_URL) ??
    (requestUrl ? new URL(requestUrl).origin : DEFAULT_PORTAL_URL);

  return new URL('/login', baseUrl).toString();
}

function cleanBaseUrl(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

async function createAuditLog(
  db: D1Database,
  input: {
    action: string;
    actorUserId: string;
    metadata: Record<string, unknown>;
    runId: string;
    timestamp: string;
  },
) {
  await db
    .prepare(
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
       VALUES (?, ?, NULL, ?, 'settlement_reminder_run', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId,
      input.action,
      input.runId,
      JSON.stringify(input.metadata),
      input.timestamp,
    )
    .run();
}

function parseMetadata(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
