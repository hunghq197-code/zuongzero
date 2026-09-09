import { env } from 'cloudflare:workers';

import {
  breakdownsByCurrency,
  periods,
  revenueTrend,
  type BreakdownItem,
  type CurrencyBreakdowns,
  type CurrencyCode,
  type RevenueTrendPoint,
  type StatementPeriod,
} from '@/lib/dashboard-data';
import { periodDisplayLabel } from '@/lib/reporting-periods';
import {
  createEmptyCurrencyBreakdowns,
  dimensionToBreakdownKey,
} from '@/lib/royalty-breakdowns';
import { summarizeSettlement } from '@/lib/settlements';

export type DashboardBreakdownsByPeriod = Record<
  string,
  Partial<Record<CurrencyCode, CurrencyBreakdowns>>
>;

export type ClientDashboardData = {
  breakdownsByPeriod: DashboardBreakdownsByPeriod;
  statementPeriods: StatementPeriod[];
  trend: RevenueTrendPoint[];
};

type StatementRow = {
  clientName: string;
  closing: number;
  costs: number;
  currency: CurrencyCode;
  id: string;
  opening: number;
  period: string;
  reservesReleased: number;
  reservesWithheld: number;
  revenue: number;
  rowCount: number;
  status: 'published' | 'locked';
  units: number;
};

type BreakdownRow = {
  currency: CurrencyCode;
  dimension: string;
  label: string;
  percentage: number;
  period: string;
  rowCount: number;
  units: number;
  value: number;
};

export async function getClientDashboardData({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}): Promise<ClientDashboardData> {
  if (!env.DB) {
    return staticDashboardData(clientId);
  }

  const statementRows = await env.DB.prepare(
    `SELECT
       rp.id,
       rp.period,
       rp.currency,
       rp.status,
       c.display_name AS clientName,
       s.opening_balance AS opening,
       s.net_revenue AS revenue,
       s.net_costs AS costs,
       s.reserves_withheld AS reservesWithheld,
       s.reserves_released AS reservesReleased,
       s.closing_balance AS closing,
       s.units,
       s.row_count AS rowCount
     FROM report_periods rp
     JOIN statements s
       ON s.report_period_id = rp.id
     JOIN clients c
       ON c.id = rp.client_id
     WHERE rp.client_id = ?
       AND rp.status IN ('published', 'locked')
       AND rp.currency = 'VND'
     ORDER BY rp.period DESC
     LIMIT 120`,
  )
    .bind(clientId)
    .all<StatementRow>();

  const statementPeriods = statementRows.results.map((row) => {
    const opening = Number(row.opening) || 0;
    const revenue = Number(row.revenue) || 0;
    const costs = Number(row.costs) || 0;
    const settlement = summarizeSettlement({
      costs,
      opening,
      reservesReleased: Number(row.reservesReleased) || 0,
      reservesWithheld: Number(row.reservesWithheld) || 0,
      revenue,
    });

    return {
      carryForward: settlement.carryForward,
      clientId,
      clientName: row.clientName || clientName,
      closing: settlement.carryForward,
      costs,
      currency: row.currency,
      id: row.id,
      label: periodDisplayLabel(row.period),
      opening,
      paid: settlement.paidAmount,
      payable: settlement.payable,
      period: row.period,
      revenue,
      rowCount: Number(row.rowCount) || 0,
      settlementStatus: settlement.status,
      status: row.status,
      units: Number(row.units) || 0,
    };
  });

  if (statementPeriods.length === 0) {
    return {
      breakdownsByPeriod: {},
      statementPeriods: [],
      trend: [],
    };
  }

  const breakdownRows = await env.DB.prepare(
    `SELECT
       rp.period,
       rp.currency,
       rb.dimension,
       rb.label,
       rb.value,
       rb.percentage,
       rb.units,
       rb.row_count AS rowCount
     FROM revenue_breakdowns rb
     JOIN report_periods rp
       ON rp.id = rb.report_period_id
     WHERE rb.client_id = ?
       AND rp.client_id = ?
       AND rp.status IN ('published', 'locked')
       AND rp.currency = 'VND'
     ORDER BY rp.period DESC, rb.dimension ASC, abs(rb.value) DESC
     LIMIT 2000`,
  )
    .bind(clientId, clientId)
    .all<BreakdownRow>();

  return {
    breakdownsByPeriod: mapBreakdownsByPeriod(breakdownRows.results),
    statementPeriods,
    trend: mapTrend(statementPeriods),
  };
}

function staticDashboardData(clientId: string): ClientDashboardData {
  const statementPeriods = periods.filter(
    (period) => period.clientId === clientId,
  );

  return {
    breakdownsByPeriod:
      statementPeriods.length > 0
        ? {
            [statementPeriods[0].period]: {
              VND: breakdownsByCurrency.VND,
            },
          }
        : {},
    statementPeriods,
    trend: statementPeriods.length > 0 ? revenueTrend : [],
  };
}

function mapTrend(statementPeriods: StatementPeriod[]) {
  const trendMap = new Map<string, RevenueTrendPoint>();

  for (const statement of [...statementPeriods].reverse()) {
    const existing = trendMap.get(statement.period) ?? {
      label: statement.label,
      period: statement.period,
      rowCount: 0,
      units: 0,
      vnd: 0,
    };

    existing.vnd += statement.revenue;
    existing.units += statement.units;
    existing.rowCount += statement.rowCount;
    trendMap.set(statement.period, existing);
  }

  return Array.from(trendMap.values());
}

function mapBreakdownsByPeriod(rows: BreakdownRow[]) {
  const result: DashboardBreakdownsByPeriod = {};

  for (const row of rows) {
    const key = dimensionToBreakdownKey(row.dimension);
    if (!key) continue;

    const currencyBreakdowns =
      (result[row.period] ??= {})[row.currency] ??
      createEmptyCurrencyBreakdowns();
    currencyBreakdowns[key].push({
      name: row.label,
      percentage: Number(row.percentage) || 0,
      rows: Number(row.rowCount) || 0,
      units: Number(row.units) || 0,
      value: Number(row.value) || 0,
    } satisfies BreakdownItem);
    result[row.period][row.currency] = currencyBreakdowns;
  }

  return result;
}
