import {
  breakdownsByCurrency,
  clients as fallbackClients,
  periods as fallbackPeriods,
  revenueTrend as fallbackRevenueTrend,
  type CurrencyCode,
} from '@/lib/dashboard-data';
import {
  currentCalendarMonth,
  periodDisplayLabel,
} from '@/lib/calendar-months';

export type AdminOverviewData = {
  month: string;
  monthLabel: string;
  previousMonth: string;
  summary: AdminSummary;
  monthlyTrend: AdminMonthlyTrendPoint[];
  topCustomers: AdminCustomerRank[];
  trendingTracks: AdminTrendItem[];
  trendingArtists: AdminTrendItem[];
  topSources: AdminTrendItem[];
  topTerritories: AdminTrendItem[];
};

export type AdminSummary = {
  activeCustomers: number;
  totalCustomers: number;
  reportingCustomers: number;
  missingCustomers: number;
  statementCount: number;
  revenueUsd: number;
  revenueVnd: number;
  trackCount: number;
  artistCount: number;
  units: number;
  sourceRows: number;
};

export type AdminMonthlyTrendPoint = {
  label: string;
  period: string;
  rowCount: number;
  units: number;
  usd: number;
  vnd: number;
};

export type AdminCustomerRank = {
  clientCode: string;
  clientId: string;
  clientName: string;
  latestPeriod: string | null;
  rowCount: number;
  statementCount: number;
  units: number;
  usd: number;
  vnd: number;
};

export type AdminTrendItem = {
  changeUsd: number;
  changeVnd: number;
  clientCount: number;
  label: string;
  rowCount: number;
  trend: 'up' | 'down' | 'flat' | 'new';
  units: number;
  usd: number;
  vnd: number;
};

export type AdminStatementRow = {
  clientCode: string;
  clientId: string;
  clientName: string;
  closing: number;
  currency: CurrencyCode;
  filename: string | null;
  lockedAt: string | null;
  period: string;
  periodLabel: string;
  publishedAt: string | null;
  reportPeriodId: string;
  revenue: number;
  rowCount: number;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
  units: number;
  uploadId: string | null;
  uploadedAt: string | null;
};

type SummaryRow = {
  activeCustomers: number;
  artistCount: number;
  reportingCustomers: number;
  revenueUsd: number;
  revenueVnd: number;
  sourceRows: number;
  statementCount: number;
  totalCustomers: number;
  trackCount: number;
  units: number;
};

type MonthlyTrendRow = {
  period: string;
  rowCount: number;
  units: number;
  usd: number;
  vnd: number;
};

type CustomerRankRow = {
  clientCode: string;
  clientId: string;
  clientName: string;
  latestPeriod: string | null;
  rowCount: number;
  statementCount: number;
  units: number;
  usd: number;
  vnd: number;
};

type DimensionRankRow = {
  clientCount: number;
  currency: CurrencyCode;
  label: string;
  rowCount: number;
  units: number;
  value: number;
};

export async function getAdminOverviewData(
  db: D1Database,
  month = currentCalendarMonth(),
): Promise<AdminOverviewData> {
  const previousMonth = addMonths(month, -1);
  const [summary, monthlyTrend, topCustomers, trendingTracks, trendingArtists] =
    await Promise.all([
      readSummary(db, month),
      readMonthlyTrend(db),
      readTopCustomers(db, month),
      readDimensionTrend(db, 'track', month, previousMonth),
      readDimensionTrend(db, 'artist', month, previousMonth),
    ]);
  const [topSources, topTerritories] = await Promise.all([
    readDimensionTrend(db, 'source', month, previousMonth, 'value'),
    readDimensionTrend(db, 'territory', month, previousMonth, 'value'),
  ]);

  return {
    month,
    monthLabel: periodDisplayLabel(month),
    monthlyTrend,
    previousMonth,
    summary,
    topCustomers,
    topSources,
    topTerritories,
    trendingArtists,
    trendingTracks,
  };
}

export async function listAdminStatements(
  db: D1Database,
  filters: {
    clientId?: string | null;
    period?: string | null;
  } = {},
): Promise<AdminStatementRow[]> {
  const clauses = [`rp.currency IN ('USD', 'VND')`];
  const bindings: string[] = [];

  if (filters.clientId) {
    clauses.push('rp.client_id = ?');
    bindings.push(filters.clientId);
  }

  if (filters.period) {
    clauses.push('rp.period = ?');
    bindings.push(filters.period);
  }

  const rows = await db
    .prepare(
      `SELECT
         rp.id AS reportPeriodId,
         rp.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         rp.period,
         rp.currency,
         rp.status,
         rp.published_at AS publishedAt,
         rp.locked_at AS lockedAt,
         s.net_revenue AS revenue,
         s.closing_balance AS closing,
         s.units,
         s.row_count AS rowCount,
         u.id AS uploadId,
         u.original_filename AS filename,
         u.created_at AS uploadedAt
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       JOIN clients c
         ON c.id = rp.client_id
       LEFT JOIN uploads u
         ON u.id = s.source_upload_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY rp.period DESC, c.display_name ASC, rp.currency ASC
       LIMIT 150`,
    )
    .bind(...bindings)
    .all<AdminStatementRow>();

  return rows.results.map((row) => ({
    ...row,
    closing: Number(row.closing) || 0,
    periodLabel: periodDisplayLabel(row.period),
    revenue: Number(row.revenue) || 0,
    rowCount: Number(row.rowCount) || 0,
    units: Number(row.units) || 0,
  }));
}

export function fallbackAdminOverviewData(
  month = currentCalendarMonth(),
): AdminOverviewData {
  const previousMonth = addMonths(month, -1);
  const activeCustomers = fallbackClients.filter(
    (client) => client.status !== 'archived',
  ).length;
  const monthPeriods = fallbackPeriods.filter(
    (period) => period.period === month,
  );
  const reportingCustomers = new Set(
    monthPeriods.map((period) => period.clientId),
  ).size;
  const usd = monthPeriods
    .filter((period) => period.currency === 'USD')
    .reduce((total, period) => total + period.revenue, 0);
  const vnd = monthPeriods
    .filter((period) => period.currency === 'VND')
    .reduce((total, period) => total + period.revenue, 0);

  return {
    month,
    monthLabel: periodDisplayLabel(month),
    monthlyTrend: fallbackRevenueTrend,
    previousMonth,
    summary: {
      activeCustomers,
      artistCount: breakdownsByCurrency.USD.artists.length,
      missingCustomers: Math.max(activeCustomers - reportingCustomers, 0),
      reportingCustomers,
      revenueUsd: usd,
      revenueVnd: vnd,
      sourceRows: monthPeriods.reduce(
        (total, period) => total + period.rowCount,
        0,
      ),
      statementCount: monthPeriods.length,
      totalCustomers: fallbackClients.length,
      trackCount: breakdownsByCurrency.USD.tracks.length,
      units: monthPeriods.reduce((total, period) => total + period.units, 0),
    },
    topCustomers: fallbackClients.slice(0, 8).map((client) => ({
      clientCode: client.code,
      clientId: client.id,
      clientName: client.name,
      latestPeriod: client.latestPeriod,
      rowCount: 0,
      statementCount: client.uploadedMonths,
      units: 0,
      usd: client.totalRevenue,
      vnd: client.secondaryRevenue,
    })),
    topSources: fallbackBreakdownTrend('sources'),
    topTerritories: fallbackBreakdownTrend('territories'),
    trendingArtists: fallbackBreakdownTrend('artists'),
    trendingTracks: fallbackBreakdownTrend('tracks'),
  };
}

export function fallbackAdminStatements(): AdminStatementRow[] {
  return fallbackPeriods.slice(0, 12).map((period) => ({
    clientCode: period.clientId,
    clientId: period.clientId,
    clientName: period.clientName,
    closing: period.closing,
    currency: period.currency,
    filename: null,
    lockedAt: null,
    period: period.period,
    periodLabel: period.label,
    publishedAt: null,
    reportPeriodId: period.id,
    revenue: period.revenue,
    rowCount: period.rowCount,
    status: period.status === 'empty' ? 'draft' : 'published',
    units: period.units,
    uploadId: null,
    uploadedAt: null,
  }));
}

async function readSummary(
  db: D1Database,
  month: string,
): Promise<AdminSummary> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM clients) AS totalCustomers,
         (SELECT COUNT(*) FROM clients WHERE status = 'active') AS activeCustomers,
         (
           SELECT COUNT(DISTINCT rp.client_id)
           FROM report_periods rp
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency IN ('USD', 'VND')
         ) AS reportingCustomers,
         (
           SELECT COUNT(*)
           FROM report_periods rp
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency IN ('USD', 'VND')
         ) AS statementCount,
         (
           SELECT COALESCE(SUM(s.net_revenue), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'USD'
         ) AS revenueUsd,
         (
           SELECT COALESCE(SUM(s.net_revenue), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
         ) AS revenueVnd,
         (
           SELECT COALESCE(SUM(s.units), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency IN ('USD', 'VND')
         ) AS units,
         (
           SELECT COALESCE(SUM(s.row_count), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency IN ('USD', 'VND')
         ) AS sourceRows,
         (
           SELECT COUNT(DISTINCT rb.label)
           FROM revenue_breakdowns rb
           JOIN report_periods rp
             ON rp.id = rb.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rb.dimension = 'track'
         ) AS trackCount,
         (
           SELECT COUNT(DISTINCT rb.label)
           FROM revenue_breakdowns rb
           JOIN report_periods rp
             ON rp.id = rb.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rb.dimension = 'artist'
         ) AS artistCount`,
    )
    .bind(month, month, month, month, month, month, month, month)
    .first<SummaryRow>();

  const totalCustomers = Number(row?.totalCustomers) || 0;
  const activeCustomers = Number(row?.activeCustomers) || 0;
  const reportingCustomers = Number(row?.reportingCustomers) || 0;

  return {
    activeCustomers,
    artistCount: Number(row?.artistCount) || 0,
    missingCustomers: Math.max(activeCustomers - reportingCustomers, 0),
    reportingCustomers,
    revenueUsd: Number(row?.revenueUsd) || 0,
    revenueVnd: Number(row?.revenueVnd) || 0,
    sourceRows: Number(row?.sourceRows) || 0,
    statementCount: Number(row?.statementCount) || 0,
    totalCustomers,
    trackCount: Number(row?.trackCount) || 0,
    units: Number(row?.units) || 0,
  };
}

async function readMonthlyTrend(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT
         rp.period,
         COALESCE(SUM(CASE WHEN rp.currency = 'USD' THEN s.net_revenue ELSE 0 END), 0) AS usd,
         COALESCE(SUM(CASE WHEN rp.currency = 'VND' THEN s.net_revenue ELSE 0 END), 0) AS vnd,
         COALESCE(SUM(s.units), 0) AS units,
         COALESCE(SUM(s.row_count), 0) AS rowCount
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       WHERE rp.status IN ('published', 'locked')
         AND rp.currency IN ('USD', 'VND')
       GROUP BY rp.period
       ORDER BY rp.period DESC
       LIMIT 12`,
    )
    .all<MonthlyTrendRow>();

  return rows.results
    .map((row) => ({
      label: periodDisplayLabel(row.period),
      period: row.period,
      rowCount: Number(row.rowCount) || 0,
      units: Number(row.units) || 0,
      usd: Number(row.usd) || 0,
      vnd: Number(row.vnd) || 0,
    }))
    .reverse();
}

async function readTopCustomers(db: D1Database, month: string) {
  const rows = await db
    .prepare(
      `SELECT
         c.id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         MAX(rp.period) AS latestPeriod,
         COUNT(DISTINCT rp.id) AS statementCount,
         COALESCE(SUM(CASE WHEN rp.currency = 'USD' THEN s.net_revenue ELSE 0 END), 0) AS usd,
         COALESCE(SUM(CASE WHEN rp.currency = 'VND' THEN s.net_revenue ELSE 0 END), 0) AS vnd,
         COALESCE(SUM(s.units), 0) AS units,
         COALESCE(SUM(s.row_count), 0) AS rowCount
       FROM clients c
       LEFT JOIN report_periods rp
         ON rp.client_id = c.id
        AND rp.period = ?
        AND rp.status IN ('published', 'locked')
        AND rp.currency IN ('USD', 'VND')
       LEFT JOIN statements s
         ON s.report_period_id = rp.id
       WHERE c.status != 'archived'
       GROUP BY c.id, c.code, c.display_name
       ORDER BY usd DESC, vnd DESC, units DESC, c.display_name ASC
       LIMIT 8`,
    )
    .bind(month)
    .all<CustomerRankRow>();

  return rows.results.map((row) => ({
    clientCode: row.clientCode,
    clientId: row.clientId,
    clientName: row.clientName,
    latestPeriod: row.latestPeriod,
    rowCount: Number(row.rowCount) || 0,
    statementCount: Number(row.statementCount) || 0,
    units: Number(row.units) || 0,
    usd: Number(row.usd) || 0,
    vnd: Number(row.vnd) || 0,
  }));
}

async function readDimensionTrend(
  db: D1Database,
  dimension: string,
  month: string,
  previousMonth: string,
  mode: 'growth' | 'value' = 'growth',
) {
  const [currentRows, previousRows] = await Promise.all([
    readDimensionRows(db, dimension, month),
    readDimensionRows(db, dimension, previousMonth),
  ]);
  const current = combineDimensionRows(currentRows);
  const previous = combineDimensionRows(previousRows);

  return Array.from(current.entries())
    .map(([label, item]) => {
      const previousItem = previous.get(label);
      const changeUsd = item.usd - (previousItem?.usd ?? 0);
      const changeVnd = item.vnd - (previousItem?.vnd ?? 0);
      return {
        ...item,
        changeUsd,
        changeVnd,
        trend: trendDirection({
          changeUsd,
          changeVnd,
          previousUsd: previousItem?.usd ?? 0,
          previousVnd: previousItem?.vnd ?? 0,
          usd: item.usd,
          vnd: item.vnd,
        }),
      };
    })
    .sort((left, right) => {
      const leftScore = trendScore(left, mode);
      const rightScore = trendScore(right, mode);
      return rightScore - leftScore || right.units - left.units;
    })
    .slice(0, 8);
}

async function readDimensionRows(
  db: D1Database,
  dimension: string,
  month: string,
) {
  const rows = await db
    .prepare(
      `SELECT
         rb.label,
         rp.currency,
         COALESCE(SUM(rb.value), 0) AS value,
         COALESCE(SUM(rb.units), 0) AS units,
         COALESCE(SUM(rb.row_count), 0) AS rowCount,
         COUNT(DISTINCT rb.client_id) AS clientCount
       FROM revenue_breakdowns rb
       JOIN report_periods rp
         ON rp.id = rb.report_period_id
       WHERE rp.period = ?
         AND rp.status IN ('published', 'locked')
         AND rp.currency IN ('USD', 'VND')
         AND rb.dimension = ?
       GROUP BY rb.label, rp.currency
       ORDER BY ABS(value) DESC
       LIMIT 120`,
    )
    .bind(month, dimension)
    .all<DimensionRankRow>();

  return rows.results;
}

function combineDimensionRows(rows: DimensionRankRow[]) {
  const byLabel = new Map<
    string,
    Omit<AdminTrendItem, 'changeUsd' | 'changeVnd' | 'trend'>
  >();

  for (const row of rows) {
    const item = byLabel.get(row.label) ?? {
      clientCount: 0,
      label: row.label,
      rowCount: 0,
      units: 0,
      usd: 0,
      vnd: 0,
    };

    if (row.currency === 'USD') {
      item.usd += Number(row.value) || 0;
    } else {
      item.vnd += Number(row.value) || 0;
    }

    item.clientCount = Math.max(item.clientCount, Number(row.clientCount) || 0);
    item.rowCount += Number(row.rowCount) || 0;
    item.units += Number(row.units) || 0;
    byLabel.set(row.label, item);
  }

  return byLabel;
}

function trendDirection(input: {
  changeUsd: number;
  changeVnd: number;
  previousUsd: number;
  previousVnd: number;
  usd: number;
  vnd: number;
}): AdminTrendItem['trend'] {
  if (
    input.previousUsd === 0 &&
    input.previousVnd === 0 &&
    (input.usd > 0 || input.vnd > 0)
  ) {
    return 'new';
  }

  if (input.changeUsd > 0 || input.changeVnd > 0) return 'up';
  if (input.changeUsd < 0 || input.changeVnd < 0) return 'down';
  return 'flat';
}

function trendScore(item: AdminTrendItem, mode: 'growth' | 'value') {
  if (mode === 'value') return Math.max(item.usd, item.vnd / 25_000);

  const usdGrowth = item.changeUsd > 0 ? item.changeUsd : 0;
  const vndGrowth = item.changeVnd > 0 ? item.changeVnd / 25_000 : 0;
  return usdGrowth + vndGrowth + Math.max(item.usd, item.vnd / 25_000) * 0.08;
}

function fallbackBreakdownTrend(
  key: 'artists' | 'sources' | 'territories' | 'tracks',
) {
  return breakdownsByCurrency.USD[key].slice(0, 8).map((item, index) => ({
    changeUsd: index < 3 ? item.value * 0.12 : 0,
    changeVnd: 0,
    clientCount: 1,
    label: item.name,
    rowCount: item.rows,
    trend: index < 3 ? ('up' as const) : ('flat' as const),
    units: item.units,
    usd: item.value,
    vnd: 0,
  }));
}

function addMonths(period: string, offset: number) {
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const zeroBasedMonth = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(zeroBasedMonth / 12);
  const nextMonth = zeroBasedMonth - nextYear * 12 + 1;

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}
