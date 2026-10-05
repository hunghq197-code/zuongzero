import { summarizeSettlement, summarizeStatementPayment } from './settlements';

export type BalanceRow = {
  id: string;
  clientId: string;
  period: string;
  status: string;
  paymentStatus: 'paid' | 'unpaid';
  opening: number;
  revenue: number;
  costs: number;
  reservesWithheld: number;
  reservesReleased: number;
};

// Rebuild the ledger from actual payments, including periods above the threshold
// that have not been paid. Never reuse a stale imported closing balance.
export function calculateStatementBalances(rows: BalanceRow[]) {
  const balances = new Map<
    string,
    { opening: number; closing: number; paid: number }
  >();
  const carry = new Map<string, number>();
  for (const row of [...rows].sort((a, b) =>
    a.period.localeCompare(b.period),
  )) {
    const opening = carry.get(row.clientId) ?? 0;
    const settlement = summarizeSettlement({
      opening,
      revenue: Number(row.revenue) || 0,
      costs: Number(row.costs) || 0,
      reservesWithheld: Number(row.reservesWithheld) || 0,
      reservesReleased: Number(row.reservesReleased) || 0,
    });
    // Stored opening is the payment snapshot for already-paid statements.
    // Rebuilding carry must not retroactively increase a historical payment.
    const paymentSnapshot = summarizeSettlement({
      opening: Number(row.opening) || 0,
      revenue: Number(row.revenue) || 0,
      costs: Number(row.costs) || 0,
      reservesWithheld: Number(row.reservesWithheld) || 0,
      reservesReleased: Number(row.reservesReleased) || 0,
    });
    const paid = summarizeStatementPayment(
      paymentSnapshot,
      row.paymentStatus,
    ).paidAmount;
    const closing = Math.round((settlement.payable - paid) * 100) / 100;
    balances.set(row.id, { opening, closing, paid });
    if (row.status === 'published' || row.status === 'locked') {
      carry.set(row.clientId, closing);
    }
  }
  return balances;
}

export async function readBalanceRows(
  db: D1Database,
  clientId?: string | null,
) {
  const rows = await db
    .prepare(`SELECT rp.id, rp.client_id AS clientId,
    rp.period, rp.status, rp.payment_status AS paymentStatus,
    s.opening_balance AS opening, s.net_revenue AS revenue, s.net_costs AS costs,
    s.reserves_withheld AS reservesWithheld, s.reserves_released AS reservesReleased
    FROM report_periods rp JOIN statements s ON s.report_period_id = rp.id
    WHERE rp.currency = 'VND' AND rp.status != 'replaced'
      AND (? IS NULL OR rp.client_id = ?)
    ORDER BY rp.period ASC`)
    .bind(clientId ?? null, clientId ?? null)
    .all<BalanceRow>();
  return rows.results;
}

export async function readStatementBalances(
  db: D1Database,
  clientId?: string | null,
) {
  return calculateStatementBalances(await readBalanceRows(db, clientId));
}

export async function readOpeningBalance(
  db: D1Database,
  clientId: string,
  period: string,
) {
  const rows = (await readBalanceRows(db, clientId)).filter(
    (row) =>
      row.period < period && ['published', 'locked'].includes(row.status),
  );
  const previous = rows.at(-1);
  return previous
    ? calculateStatementBalances(rows).get(previous.id)!.closing
    : 0;
}

export async function findFinalizedSuccessor(
  db: D1Database,
  clientId: string,
  period: string,
) {
  return db
    .prepare(`SELECT period FROM report_periods
    WHERE client_id = ? AND currency = 'VND' AND period > ?
      AND status != 'replaced' AND (payment_status = 'paid' OR status = 'locked')
    ORDER BY period LIMIT 1`)
    .bind(clientId, period)
    .first<{ period: string }>();
}
