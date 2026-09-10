export type TrackGuaranteeStatus = 'active' | 'recouped' | 'archived';

export type TrackGuaranteeRow = {
  balanceAmount: number;
  clientCode: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  createdByEmail: string | null;
  id: string;
  initialAmount: number;
  lastRecoupedPeriod: string | null;
  notes: string | null;
  recoupedAmount: number;
  recoupmentCount: number;
  status: TrackGuaranteeStatus;
  trackExternalId: string | null;
  trackKey: string;
  trackTitle: string;
  updatedAt: string;
};

export type TrackRevenueInput = {
  rows: number;
  trackExternalId: string | null;
  trackTitle: string;
  units: number;
  value: number;
};

export type PlannedTrackRecoupment = {
  amount: number;
  balanceAfter: number;
  guaranteeId: string;
  revenueAmount: number;
  status: TrackGuaranteeStatus;
  trackTitle: string;
};

type TrackGuaranteeDbRow = {
  balanceAmount: number;
  clientCode: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  createdByEmail: string | null;
  id: string;
  initialAmount: number;
  lastRecoupedPeriod: string | null;
  notes: string | null;
  recoupedAmount: number;
  recoupmentCount: number;
  status: TrackGuaranteeStatus;
  trackExternalId: string | null;
  trackKey: string;
  trackTitle: string;
  updatedAt: string;
};

type RecoupmentDbRow = {
  amount: number;
  guaranteeId: string;
};

type RecoupmentCandidateRow = {
  balanceAmount: number;
  createdAt: string;
  id: string;
  initialAmount: number;
  recoupedAmount: number;
  status: TrackGuaranteeStatus;
  trackExternalId: string | null;
  trackKey: string;
  trackTitle: string;
};

export async function listTrackGuarantees(
  db: D1Database,
  filters: {
    clientId?: string | null;
    limit?: number;
    status?: TrackGuaranteeStatus | 'all' | null;
  } = {},
): Promise<TrackGuaranteeRow[]> {
  if (!(await hasGuaranteeTables(db))) return [];

  const clauses = ['1 = 1'];
  const bindings: Array<number | string> = [];
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 200), 1), 500);

  if (filters.clientId) {
    clauses.push('g.client_id = ?');
    bindings.push(filters.clientId);
  }

  if (filters.status && filters.status !== 'all') {
    clauses.push('g.status = ?');
    bindings.push(filters.status);
  }

  const rows = await db
    .prepare(
      `SELECT
         g.id,
         g.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         g.track_title AS trackTitle,
         g.track_external_id AS trackExternalId,
         g.track_key AS trackKey,
         g.initial_amount AS initialAmount,
         g.recouped_amount AS recoupedAmount,
         g.balance_amount AS balanceAmount,
         g.status,
         g.notes,
         g.created_at AS createdAt,
         g.updated_at AS updatedAt,
         u.email AS createdByEmail,
         MAX(rp.period) AS lastRecoupedPeriod,
         COUNT(r.id) AS recoupmentCount
       FROM track_guarantees g
       JOIN clients c
         ON c.id = g.client_id
       LEFT JOIN users u
         ON u.id = g.created_by_user_id
       LEFT JOIN track_guarantee_recoupments r
         ON r.guarantee_id = g.id
       LEFT JOIN report_periods rp
         ON rp.id = r.report_period_id
       WHERE ${clauses.join(' AND ')}
       GROUP BY
         g.id,
         g.client_id,
         c.code,
         c.display_name,
         g.track_title,
         g.track_external_id,
         g.track_key,
         g.initial_amount,
         g.recouped_amount,
         g.balance_amount,
         g.status,
         g.notes,
         g.created_at,
         g.updated_at,
         u.email
       ORDER BY
         CASE g.status
           WHEN 'active' THEN 0
           WHEN 'recouped' THEN 1
           ELSE 2
         END,
         g.updated_at DESC
       LIMIT ?`,
    )
    .bind(...bindings, limit)
    .all<TrackGuaranteeDbRow>();

  return rows.results.map((row) => ({
    balanceAmount: Number(row.balanceAmount) || 0,
    clientCode: row.clientCode,
    clientId: row.clientId,
    clientName: row.clientName,
    createdAt: row.createdAt,
    createdByEmail: row.createdByEmail,
    id: row.id,
    initialAmount: Number(row.initialAmount) || 0,
    lastRecoupedPeriod: row.lastRecoupedPeriod,
    notes: row.notes,
    recoupedAmount: Number(row.recoupedAmount) || 0,
    recoupmentCount: Number(row.recoupmentCount) || 0,
    status: row.status,
    trackExternalId: row.trackExternalId,
    trackKey: row.trackKey,
    trackTitle: row.trackTitle,
    updatedAt: row.updatedAt,
  }));
}

export async function planTrackGuaranteeRecoupments({
  clientId,
  db,
  now,
  reportPeriodId,
  sourceUploadId,
  trackRevenue,
}: {
  clientId: string;
  db: D1Database;
  now: string;
  reportPeriodId: string;
  sourceUploadId: string;
  trackRevenue: TrackRevenueInput[];
}): Promise<{
  deductionTotal: number;
  recoupments: PlannedTrackRecoupment[];
  statements: D1PreparedStatement[];
}> {
  if (!(await hasGuaranteeTables(db))) {
    return {
      deductionTotal: 0,
      recoupments: [],
      statements: [],
    };
  }

  const previousRows = await readReportPeriodRecoupments(db, reportPeriodId);
  const previousByGuarantee = groupRecoupmentAmounts(previousRows);
  const statements = [
    ...buildGuaranteeReversalStatements(db, previousByGuarantee, now),
    db
      .prepare(
        `DELETE FROM track_guarantee_recoupments
         WHERE report_period_id = ?`,
      )
      .bind(reportPeriodId),
  ];
  const revenueMap = buildTrackRevenueMap(trackRevenue);

  if (revenueMap.size === 0) {
    return {
      deductionTotal: 0,
      recoupments: [],
      statements,
    };
  }

  const candidates = await readRecoupmentCandidates(db, clientId);
  const recoupments: PlannedTrackRecoupment[] = [];

  for (const guarantee of candidates) {
    const revenue = findTrackRevenueForGuarantee(revenueMap, guarantee);
    if (!revenue || revenue.remaining <= 0) continue;

    const restoredAmount = previousByGuarantee.get(guarantee.id) ?? 0;
    const adjustedRecouped = roundMoney(
      Math.max((Number(guarantee.recoupedAmount) || 0) - restoredAmount, 0),
    );
    const adjustedBalance = roundMoney(
      Math.max((Number(guarantee.initialAmount) || 0) - adjustedRecouped, 0),
    );
    if (adjustedBalance <= 0) continue;

    const amount = roundMoney(Math.min(revenue.remaining, adjustedBalance));
    if (amount <= 0) continue;

    revenue.remaining = roundMoney(revenue.remaining - amount);
    const nextRecouped = roundMoney(adjustedRecouped + amount);
    const nextBalance = roundMoney(
      Math.max((Number(guarantee.initialAmount) || 0) - nextRecouped, 0),
    );
    const nextStatus: TrackGuaranteeStatus =
      nextBalance <= 0 ? 'recouped' : 'active';

    recoupments.push({
      amount,
      balanceAfter: nextBalance,
      guaranteeId: guarantee.id,
      revenueAmount: revenue.value,
      status: nextStatus,
      trackTitle: guarantee.trackTitle,
    });

    statements.push(
      db
        .prepare(
          `UPDATE track_guarantees
           SET recouped_amount = ?,
               balance_amount = ?,
               status = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .bind(nextRecouped, nextBalance, nextStatus, now, guarantee.id),
      db
        .prepare(
          `INSERT INTO track_guarantee_recoupments (
             id,
             guarantee_id,
             client_id,
             report_period_id,
             source_upload_id,
             track_title,
             revenue_amount,
             amount,
             created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `recoup:${reportPeriodId}:${guarantee.id}`,
          guarantee.id,
          clientId,
          reportPeriodId,
          sourceUploadId,
          guarantee.trackTitle,
          revenue.value,
          amount,
          now,
        ),
    );
  }

  return {
    deductionTotal: roundMoney(
      recoupments.reduce((total, recoupment) => total + recoupment.amount, 0),
    ),
    recoupments,
    statements,
  };
}

export async function buildReverseGuaranteeRecoupmentStatements(
  db: D1Database,
  reportPeriodId: string,
  now: string,
) {
  if (!(await hasGuaranteeTables(db))) return [];

  const previousRows = await readReportPeriodRecoupments(db, reportPeriodId);
  const previousByGuarantee = groupRecoupmentAmounts(previousRows);

  if (previousByGuarantee.size === 0) return [];

  return [
    ...buildGuaranteeReversalStatements(db, previousByGuarantee, now),
    db
      .prepare(
        `DELETE FROM track_guarantee_recoupments
         WHERE report_period_id = ?`,
      )
      .bind(reportPeriodId),
  ];
}

export function normalizeTrackKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeTrackExternalId(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export async function hasGuaranteeTables(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('track_guarantees', 'track_guarantee_recoupments')`,
    )
    .all<{ name: string }>();
  const names = new Set(rows.results.map((row) => row.name));

  return (
    names.has('track_guarantees') && names.has('track_guarantee_recoupments')
  );
}

function buildTrackRevenueMap(trackRevenue: TrackRevenueInput[]) {
  const byExternalId = new Map<
    string,
    { remaining: number; trackTitle: string; value: number }
  >();
  const byTrackKey = new Map<
    string,
    { remaining: number; trackTitle: string; value: number }
  >();

  for (const item of trackRevenue) {
    const value = Number(item.value) || 0;
    if (value <= 0) continue;

    const trackKey = normalizeTrackKey(item.trackTitle);
    if (trackKey) addTrackRevenueEntry(byTrackKey, trackKey, item, value);

    const externalKey = normalizeTrackExternalId(item.trackExternalId ?? '');
    if (externalKey) {
      addTrackRevenueEntry(byExternalId, externalKey, item, value);
    }
  }

  return {
    byExternalId,
    byTrackKey,
    size: byExternalId.size + byTrackKey.size,
  };
}

function findTrackRevenueForGuarantee(
  revenueMap: ReturnType<typeof buildTrackRevenueMap>,
  guarantee: RecoupmentCandidateRow,
) {
  const externalKey = normalizeTrackExternalId(guarantee.trackExternalId ?? '');
  if (externalKey) return revenueMap.byExternalId.get(externalKey);

  return revenueMap.byTrackKey.get(guarantee.trackKey);
}

function addTrackRevenueEntry(
  target: Map<string, { remaining: number; trackTitle: string; value: number }>,
  key: string,
  item: TrackRevenueInput,
  value: number,
) {
  const existing = target.get(key) ?? {
    remaining: 0,
    trackTitle: item.trackTitle,
    value: 0,
  };
  existing.remaining = roundMoney(existing.remaining + value);
  existing.value = roundMoney(existing.value + value);
  target.set(key, existing);
}

async function readReportPeriodRecoupments(
  db: D1Database,
  reportPeriodId: string,
) {
  const rows = await db
    .prepare(
      `SELECT guarantee_id AS guaranteeId,
              amount
       FROM track_guarantee_recoupments
       WHERE report_period_id = ?`,
    )
    .bind(reportPeriodId)
    .all<RecoupmentDbRow>();

  return rows.results;
}

async function readRecoupmentCandidates(db: D1Database, clientId: string) {
  const rows = await db
    .prepare(
      `SELECT
         id,
         track_title AS trackTitle,
         track_external_id AS trackExternalId,
         track_key AS trackKey,
         initial_amount AS initialAmount,
         recouped_amount AS recoupedAmount,
         balance_amount AS balanceAmount,
         status,
         created_at AS createdAt
       FROM track_guarantees
       WHERE client_id = ?
         AND status IN ('active', 'recouped')
       ORDER BY created_at ASC`,
    )
    .bind(clientId)
    .all<RecoupmentCandidateRow>();

  return rows.results;
}

function groupRecoupmentAmounts(rows: RecoupmentDbRow[]) {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    grouped.set(
      row.guaranteeId,
      roundMoney((grouped.get(row.guaranteeId) ?? 0) + Number(row.amount || 0)),
    );
  }

  return grouped;
}

function buildGuaranteeReversalStatements(
  db: D1Database,
  recoupmentsByGuarantee: Map<string, number>,
  now: string,
) {
  return Array.from(recoupmentsByGuarantee.entries()).map(
    ([guaranteeId, amount]) =>
      db
        .prepare(
          `UPDATE track_guarantees
           SET recouped_amount = max(recouped_amount - ?, 0),
               balance_amount = min(initial_amount, balance_amount + ?),
               status = CASE
                 WHEN status = 'archived' THEN 'archived'
                 ELSE 'active'
               END,
               updated_at = ?
           WHERE id = ?`,
        )
        .bind(amount, amount, now, guaranteeId),
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
