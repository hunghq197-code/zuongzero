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
import {
  listTrackGuarantees,
  type TrackGuaranteeRow,
} from '@/lib/guarantees';
import {
  hasStatementLineItemsTable,
  type StatementLineItem,
} from '@/lib/statement-line-items';

export type DashboardBreakdownsByPeriod = Record<
  string,
  Partial<Record<CurrencyCode, CurrencyBreakdowns>>
>;

export type ClientDashboardData = {
  breakdownsByPeriod: DashboardBreakdownsByPeriod;
  guarantees: TrackGuaranteeRow[];
  lineItemsByPeriod: Record<string, StatementLineItem[]>;
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

type StatementLineItemSqlRow = Omit<StatementLineItem, 'currency'> & {
  currency: CurrencyCode;
  period: string;
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

  const [statementRows, guarantees] = await Promise.all([
    env.DB.prepare(
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
      .all<StatementRow>(),
    listTrackGuarantees(env.DB, {
      clientId,
      limit: 120,
    }),
  ]);

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
      guarantees,
      lineItemsByPeriod: {},
      statementPeriods: [],
      trend: [],
    };
  }

  const lineItemsTableReady = await hasStatementLineItemsTable(env.DB);
  const [breakdownRows, lineItemRows] = await Promise.all([
    env.DB.prepare(
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
      .all<BreakdownRow>(),
    lineItemsTableReady
      ? env.DB.prepare(
          `SELECT
             rp.period,
             li.row_index AS rowIndex,
             li.account_no AS accountNo,
             li.contract_name AS contractName,
             li.content_type AS contentType,
             li.start_date AS startDate,
             li.period_end_date AS periodEndDate,
             li.release_title AS releaseTitle,
             li.release_artist AS releaseArtist,
             li.isrc,
             li.track_title AS trackTitle,
             li.track_version AS trackVersion,
             li.track_artist AS trackArtist,
             li.sales_period AS salesPeriod,
             li.release_label AS releaseLabel,
             li.territory,
             li.distribution_channel AS distributionChannel,
             li.configuration,
             li.partner,
             li.sales,
             li.gross_income AS grossIncome,
             li.royalty_rate AS royaltyRate,
             li.net_payable AS netPayable,
             li.currency
           FROM statement_line_items li
           JOIN report_periods rp
             ON rp.id = li.report_period_id
           WHERE li.client_id = ?
             AND rp.client_id = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
           ORDER BY rp.period DESC, li.row_index ASC
           LIMIT 5000`,
        )
          .bind(clientId, clientId)
          .all<StatementLineItemSqlRow>()
      : Promise.resolve({ results: [] as StatementLineItemSqlRow[] }),
  ]);

  return {
    breakdownsByPeriod: mapBreakdownsByPeriod(breakdownRows.results),
    guarantees,
    lineItemsByPeriod: mapLineItemsByPeriod(lineItemRows.results),
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
    guarantees: [],
    lineItemsByPeriod: {},
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

function mapLineItemsByPeriod(rows: StatementLineItemSqlRow[]) {
  const result: Record<string, StatementLineItem[]> = {};

  for (const row of rows) {
    const items = (result[row.period] ??= []);
    items.push({
      accountNo: row.accountNo,
      configuration: row.configuration,
      contractName: row.contractName,
      contentType: row.contentType,
      currency: row.currency,
      distributionChannel: row.distributionChannel,
      grossIncome:
        row.grossIncome === null ? null : Number(row.grossIncome) || 0,
      isrc: row.isrc,
      netPayable: Number(row.netPayable) || 0,
      partner: row.partner,
      periodEndDate: row.periodEndDate,
      releaseArtist: row.releaseArtist,
      releaseLabel: row.releaseLabel,
      releaseTitle: row.releaseTitle,
      royaltyRate:
        row.royaltyRate === null ? null : Number(row.royaltyRate) || 0,
      rowIndex: Number(row.rowIndex) || 0,
      sales: Number(row.sales) || 0,
      salesPeriod: row.salesPeriod,
      startDate: row.startDate,
      territory: row.territory,
      trackArtist: row.trackArtist,
      trackTitle: row.trackTitle,
      trackVersion: row.trackVersion,
    });
  }

  return result;
}
