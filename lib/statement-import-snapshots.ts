import { hasStatementLineItemsTable } from '@/lib/statement-line-items';

const SNAPSHOT_VERSION = 1;
const RESTORE_BATCH_SIZE = 40;

type SnapshotReportPeriod = {
  clientId: string;
  createdAt: string;
  currency: string;
  id: string;
  lockedAt: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  paymentStatus: string;
  period: string;
  publishedAt: string | null;
  status: string;
  updatedAt: string;
};

type SnapshotStatement = {
  clientId: string;
  closingBalance: number;
  createdAt: string;
  grossRevenue: number;
  id: string;
  netCosts: number;
  netRevenue: number;
  openingBalance: number;
  reportPeriodId: string;
  reservesReleased: number;
  reservesWithheld: number;
  rowCount: number;
  sourceUploadId: string;
  units: number;
  updatedAt: string;
};

type SnapshotBreakdown = {
  clientId: string;
  createdAt: string;
  dimension: string;
  id: string;
  label: string;
  percentage: number;
  reportPeriodId: string;
  rowCount: number;
  units: number;
  value: number;
};

type SnapshotLineItem = {
  accountNo: string;
  appliedRoyaltyRateBps: number | null;
  calculationMode: string;
  clientId: string;
  configuration: string | null;
  contentType: string | null;
  contractName: string | null;
  createdAt: string;
  currency: string;
  distributionChannel: string | null;
  grossIncome: number | null;
  id: string;
  isrc: string | null;
  netPayable: number;
  partner: string | null;
  periodEndDate: string | null;
  releaseArtist: string | null;
  releaseLabel: string | null;
  releaseTitle: string | null;
  reportPeriodId: string;
  royaltyRate: number | null;
  royaltyRuleId: string | null;
  rowIndex: number;
  sales: number;
  salesPeriod: string | null;
  sourceNetPayable: number | null;
  sourceRoyaltyRate: number | null;
  sourceUploadId: string;
  startDate: string | null;
  territory: string | null;
  trackArtist: string | null;
  trackTitle: string | null;
  trackVersion: string | null;
};

type SnapshotRecoupment = {
  amount: number;
  clientId: string;
  createdAt: string;
  guaranteeId: string;
  id: string;
  reportPeriodId: string;
  revenueAmount: number;
  sourceUploadId: string;
  trackTitle: string;
};

type SnapshotGuarantee = {
  balanceAmount: number;
  id: string;
  recoupedAmount: number;
  status: string;
  updatedAt: string;
};

export type StatementImportSnapshot = {
  breakdowns: SnapshotBreakdown[];
  capturedAt: string;
  clientId: string;
  guarantees: SnapshotGuarantee[];
  lineItems: SnapshotLineItem[];
  period: string;
  recoupments: SnapshotRecoupment[];
  reportPeriod: SnapshotReportPeriod | null;
  reportPeriodId: string;
  statement: SnapshotStatement | null;
  version: typeof SNAPSHOT_VERSION;
};

export function statementImportSnapshotKey({
  clientId,
  period,
  uploadId,
}: {
  clientId: string;
  period: string;
  uploadId: string;
}) {
  return `clients/${clientId}/periods/${period}/snapshots/${uploadId}.json`;
}

export async function captureStatementImportSnapshot({
  clientId,
  db,
  period,
}: {
  clientId: string;
  db: D1Database;
  period: string;
}): Promise<StatementImportSnapshot> {
  const reportPeriodId = `${clientId}:${period}:VND`;
  const reportPeriod = await db
    .prepare(
      `SELECT
         id,
         client_id AS clientId,
         period,
         currency,
         status,
         payment_status AS paymentStatus,
         paid_at AS paidAt,
         paid_by_user_id AS paidByUserId,
         published_at AS publishedAt,
         locked_at AS lockedAt,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM report_periods
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(reportPeriodId)
    .first<SnapshotReportPeriod>();
  const statement = await db
    .prepare(
      `SELECT
         id,
         client_id AS clientId,
         report_period_id AS reportPeriodId,
         source_upload_id AS sourceUploadId,
         opening_balance AS openingBalance,
         gross_revenue AS grossRevenue,
         net_revenue AS netRevenue,
         net_costs AS netCosts,
         reserves_withheld AS reservesWithheld,
         reserves_released AS reservesReleased,
         closing_balance AS closingBalance,
         units,
         row_count AS rowCount,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM statements
       WHERE report_period_id = ?
       LIMIT 1`,
    )
    .bind(reportPeriodId)
    .first<SnapshotStatement>();
  const breakdowns = await db
    .prepare(
      `SELECT
         id,
         client_id AS clientId,
         report_period_id AS reportPeriodId,
         dimension,
         label,
         value,
         percentage,
         units,
         row_count AS rowCount,
         created_at AS createdAt
       FROM revenue_breakdowns
       WHERE report_period_id = ?
       ORDER BY dimension ASC, value DESC, id ASC`,
    )
    .bind(reportPeriodId)
    .all<SnapshotBreakdown>();
  const recoupments = await db
    .prepare(
      `SELECT
         id,
         guarantee_id AS guaranteeId,
         client_id AS clientId,
         report_period_id AS reportPeriodId,
         source_upload_id AS sourceUploadId,
         track_title AS trackTitle,
         revenue_amount AS revenueAmount,
         amount,
         created_at AS createdAt
       FROM track_guarantee_recoupments
       WHERE report_period_id = ?
       ORDER BY id ASC`,
    )
    .bind(reportPeriodId)
    .all<SnapshotRecoupment>();
  const guarantees = await db
    .prepare(
      `SELECT
         id,
         recouped_amount AS recoupedAmount,
         balance_amount AS balanceAmount,
         status,
         updated_at AS updatedAt
       FROM track_guarantees
       WHERE client_id = ?
       ORDER BY id ASC`,
    )
    .bind(clientId)
    .all<SnapshotGuarantee>();
  const lineItems = (await hasStatementLineItemsTable(db))
    ? await readSnapshotLineItems(db, reportPeriodId)
    : [];

  return {
    breakdowns: breakdowns.results,
    capturedAt: new Date().toISOString(),
    clientId,
    guarantees: guarantees.results,
    lineItems,
    period,
    recoupments: recoupments.results,
    reportPeriod: reportPeriod ?? null,
    reportPeriodId,
    statement: statement ?? null,
    version: SNAPSHOT_VERSION,
  };
}

export function parseStatementImportSnapshot(
  value: unknown,
  expected: { clientId: string; period: string; reportPeriodId: string },
) {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<StatementImportSnapshot>;

  if (
    snapshot.version !== SNAPSHOT_VERSION ||
    snapshot.clientId !== expected.clientId ||
    snapshot.period !== expected.period ||
    snapshot.reportPeriodId !== expected.reportPeriodId ||
    !Array.isArray(snapshot.breakdowns) ||
    !Array.isArray(snapshot.guarantees) ||
    !Array.isArray(snapshot.lineItems) ||
    !Array.isArray(snapshot.recoupments)
  ) {
    return null;
  }

  return snapshot as StatementImportSnapshot;
}

export async function restoreStatementImportSnapshot(
  db: D1Database,
  snapshot: StatementImportSnapshot,
) {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `DELETE FROM track_guarantee_recoupments
         WHERE report_period_id = ?`,
      )
      .bind(snapshot.reportPeriodId),
    db
      .prepare(
        `DELETE FROM statement_line_items
         WHERE report_period_id = ?`,
      )
      .bind(snapshot.reportPeriodId),
    db
      .prepare(
        `DELETE FROM revenue_breakdowns
         WHERE report_period_id = ?`,
      )
      .bind(snapshot.reportPeriodId),
    db
      .prepare(
        `DELETE FROM statements
         WHERE report_period_id = ?`,
      )
      .bind(snapshot.reportPeriodId),
  ];

  for (const guarantee of snapshot.guarantees) {
    statements.push(
      db
        .prepare(
          `UPDATE track_guarantees
           SET recouped_amount = ?,
               balance_amount = ?,
               status = ?,
               updated_at = ?
           WHERE id = ?
             AND client_id = ?`,
        )
        .bind(
          guarantee.recoupedAmount,
          guarantee.balanceAmount,
          guarantee.status,
          guarantee.updatedAt,
          guarantee.id,
          snapshot.clientId,
        ),
    );
  }

  if (snapshot.reportPeriod) {
    const row = snapshot.reportPeriod;
    statements.push(
      db
        .prepare(
          `INSERT INTO report_periods (
             id, client_id, period, currency, status, payment_status,
             paid_at, paid_by_user_id, published_at, locked_at,
             created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             client_id = excluded.client_id,
             period = excluded.period,
             currency = excluded.currency,
             status = excluded.status,
             payment_status = excluded.payment_status,
             paid_at = excluded.paid_at,
             paid_by_user_id = excluded.paid_by_user_id,
             published_at = excluded.published_at,
             locked_at = excluded.locked_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          row.id,
          row.clientId,
          row.period,
          row.currency,
          row.status,
          row.paymentStatus,
          row.paidAt,
          row.paidByUserId,
          row.publishedAt,
          row.lockedAt,
          row.createdAt,
          row.updatedAt,
        ),
    );
  } else {
    statements.push(
      db
        .prepare(
          `DELETE FROM report_periods
           WHERE id = ?`,
        )
        .bind(snapshot.reportPeriodId),
    );
  }

  if (snapshot.statement) {
    const row = snapshot.statement;
    statements.push(
      db
        .prepare(
          `INSERT INTO statements (
             id, client_id, report_period_id, source_upload_id,
             opening_balance, gross_revenue, net_revenue, net_costs,
             reserves_withheld, reserves_released, closing_balance,
             units, row_count, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.clientId,
          row.reportPeriodId,
          row.sourceUploadId,
          row.openingBalance,
          row.grossRevenue,
          row.netRevenue,
          row.netCosts,
          row.reservesWithheld,
          row.reservesReleased,
          row.closingBalance,
          row.units,
          row.rowCount,
          row.createdAt,
          row.updatedAt,
        ),
    );
  }

  statements.push(
    ...snapshot.breakdowns.map((row) =>
      db
        .prepare(
          `INSERT INTO revenue_breakdowns (
             id, client_id, report_period_id, dimension, label, value,
             percentage, units, row_count, created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.clientId,
          row.reportPeriodId,
          row.dimension,
          row.label,
          row.value,
          row.percentage,
          row.units,
          row.rowCount,
          row.createdAt,
        ),
    ),
    ...snapshot.lineItems.map((row) => buildLineItemInsert(db, row)),
    ...snapshot.recoupments.map((row) =>
      db
        .prepare(
          `INSERT INTO track_guarantee_recoupments (
             id, guarantee_id, client_id, report_period_id, source_upload_id,
             track_title, revenue_amount, amount, created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.guaranteeId,
          row.clientId,
          row.reportPeriodId,
          row.sourceUploadId,
          row.trackTitle,
          row.revenueAmount,
          row.amount,
          row.createdAt,
        ),
    ),
  );

  for (let index = 0; index < statements.length; index += RESTORE_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + RESTORE_BATCH_SIZE));
  }
}

async function readSnapshotLineItems(db: D1Database, reportPeriodId: string) {
  const rows = await db
    .prepare(
      `SELECT
         id,
         client_id AS clientId,
         report_period_id AS reportPeriodId,
         source_upload_id AS sourceUploadId,
         row_index AS rowIndex,
         account_no AS accountNo,
         contract_name AS contractName,
         content_type AS contentType,
         start_date AS startDate,
         period_end_date AS periodEndDate,
         release_title AS releaseTitle,
         release_artist AS releaseArtist,
         isrc,
         track_title AS trackTitle,
         track_version AS trackVersion,
         track_artist AS trackArtist,
         sales_period AS salesPeriod,
         release_label AS releaseLabel,
         territory,
         distribution_channel AS distributionChannel,
         configuration,
         partner,
         sales,
         gross_income AS grossIncome,
         royalty_rate AS royaltyRate,
         net_payable AS netPayable,
         source_royalty_rate AS sourceRoyaltyRate,
         source_net_payable AS sourceNetPayable,
         calculation_mode AS calculationMode,
         royalty_rule_id AS royaltyRuleId,
         applied_royalty_rate_bps AS appliedRoyaltyRateBps,
         currency,
         created_at AS createdAt
       FROM statement_line_items
       WHERE report_period_id = ?
       ORDER BY row_index ASC, id ASC`,
    )
    .bind(reportPeriodId)
    .all<SnapshotLineItem>();

  return rows.results;
}

function buildLineItemInsert(db: D1Database, row: SnapshotLineItem) {
  return db
    .prepare(
      `INSERT INTO statement_line_items (
         id, client_id, report_period_id, source_upload_id, row_index,
         account_no, contract_name, content_type, start_date, period_end_date,
         release_title, release_artist, isrc, track_title, track_version,
         track_artist, sales_period, release_label, territory,
         distribution_channel, configuration, partner, sales, gross_income,
         royalty_rate, net_payable, source_royalty_rate, source_net_payable,
         calculation_mode, royalty_rule_id, applied_royalty_rate_bps,
         currency, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.clientId,
      row.reportPeriodId,
      row.sourceUploadId,
      row.rowIndex,
      row.accountNo,
      row.contractName,
      row.contentType,
      row.startDate,
      row.periodEndDate,
      row.releaseTitle,
      row.releaseArtist,
      row.isrc,
      row.trackTitle,
      row.trackVersion,
      row.trackArtist,
      row.salesPeriod,
      row.releaseLabel,
      row.territory,
      row.distributionChannel,
      row.configuration,
      row.partner,
      row.sales,
      row.grossIncome,
      row.royaltyRate,
      row.netPayable,
      row.sourceRoyaltyRate,
      row.sourceNetPayable,
      row.calculationMode,
      row.royaltyRuleId,
      row.appliedRoyaltyRateBps,
      row.currency,
      row.createdAt,
    );
}
