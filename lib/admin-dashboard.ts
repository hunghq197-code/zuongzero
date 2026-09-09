import {
  breakdownsByCurrency,
  clients as fallbackClients,
  periods as fallbackPeriods,
  revenueTrend as fallbackRevenueTrend,
  type CurrencyCode,
} from '@/lib/dashboard-data';
import {
  currentCalendarQuarter,
  periodDisplayLabel,
  previousCalendarQuarter,
} from '@/lib/reporting-periods';

export type AdminOverviewData = {
  period: string;
  periodLabel: string;
  previousPeriod: string;
  summary: AdminSummary;
  quarterlyTrend: AdminQuarterlyTrendPoint[];
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
  revenueVnd: number;
  trackCount: number;
  artistCount: number;
  units: number;
  sourceRows: number;
};

export type AdminQuarterlyTrendPoint = {
  label: string;
  period: string;
  rowCount: number;
  units: number;
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
  vnd: number;
};

export type AdminTrendItem = {
  changeVnd: number;
  clientCount: number;
  label: string;
  rowCount: number;
  trend: 'up' | 'down' | 'flat' | 'new';
  units: number;
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
  revenueVnd: number;
  sourceRows: number;
  statementCount: number;
  totalCustomers: number;
  trackCount: number;
  units: number;
};

type QuarterlyTrendRow = {
  period: string;
  rowCount: number;
  units: number;
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
  vnd: number;
};

type DimensionRankRow = {
  clientCount: number;
  label: string;
  rowCount: number;
  units: number;
  value: number;
};

export async function getAdminOverviewData(
  db: D1Database,
  period = currentCalendarQuarter(),
): Promise<AdminOverviewData> {
  const previousPeriod = previousCalendarQuarter(period);
  const [
    summary,
    quarterlyTrend,
    topCustomers,
    trendingTracks,
    trendingArtists,
  ] = await Promise.all([
    readSummary(db, period),
    readQuarterlyTrend(db),
    readTopCustomers(db, period),
    readDimensionTrend(db, 'track', period, previousPeriod),
    readDimensionTrend(db, 'artist', period, previousPeriod),
  ]);
  const [topSources, topTerritories] = await Promise.all([
    readDimensionTrend(db, 'source', period, previousPeriod, 'value'),
    readDimensionTrend(db, 'territory', period, previousPeriod, 'value'),
  ]);

  return {
    period,
    periodLabel: periodDisplayLabel(period),
    previousPeriod,
    quarterlyTrend,
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
  const clauses = [`rp.currency = 'VND'`];
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
       ORDER BY rp.period DESC, c.display_name ASC
       LIMIT 150`,
    )
    .bind(...bindings)
    .all<AdminStatementRow>();

  return rows.results.map((row) => ({
    ...row,
    closing: Number(row.closing) || 0,
    currency: 'VND',
    periodLabel: periodDisplayLabel(row.period),
    revenue: Number(row.revenue) || 0,
    rowCount: Number(row.rowCount) || 0,
    units: Number(row.units) || 0,
  }));
}

export function fallbackAdminOverviewData(
  period = currentCalendarQuarter(),
): AdminOverviewData {
  const previousPeriod = previousCalendarQuarter(period);
  const activeCustomers = fallbackClients.filter(
    (client) => client.status !== 'archived',
  ).length;
  const periodStatements = fallbackPeriods.filter(
    (statement) => statement.period === period && statement.currency === 'VND',
  );
  const reportingCustomers = new Set(
    periodStatements.map((statement) => statement.clientId),
  ).size;
  const vnd = periodStatements.reduce(
    (total, statement) => total + statement.revenue,
    0,
  );

  return {
    period,
    periodLabel: periodDisplayLabel(period),
    previousPeriod,
    quarterlyTrend: fallbackRevenueTrend,
    summary: {
      activeCustomers,
      artistCount: breakdownsByCurrency.VND.artists.length,
      missingCustomers: Math.max(activeCustomers - reportingCustomers, 0),
      reportingCustomers,
      revenueVnd: vnd,
      sourceRows: periodStatements.reduce(
        (total, statement) => total + statement.rowCount,
        0,
      ),
      statementCount: periodStatements.length,
      totalCustomers: fallbackClients.length,
      trackCount: breakdownsByCurrency.VND.tracks.length,
      units: periodStatements.reduce(
        (total, statement) => total + statement.units,
        0,
      ),
    },
    topCustomers: fallbackClients.slice(0, 8).map((client) => ({
      clientCode: client.code,
      clientId: client.id,
      clientName: client.name,
      latestPeriod: client.latestPeriod,
      rowCount: 0,
      statementCount: client.uploadedQuarters,
      units: 0,
      vnd: client.totalRevenue,
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
    currency: 'VND',
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
  period: string,
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
             AND rp.currency = 'VND'
         ) AS reportingCustomers,
         (
           SELECT COUNT(*)
           FROM report_periods rp
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
         ) AS statementCount,
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
             AND rp.currency = 'VND'
         ) AS units,
         (
           SELECT COALESCE(SUM(s.row_count), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE rp.period = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
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
    .bind(period, period, period, period, period, period, period)
    .first<SummaryRow>();

  const totalCustomers = Number(row?.totalCustomers) || 0;
  const activeCustomers = Number(row?.activeCustomers) || 0;
  const reportingCustomers = Number(row?.reportingCustomers) || 0;

  return {
    activeCustomers,
    artistCount: Number(row?.artistCount) || 0,
    missingCustomers: Math.max(activeCustomers - reportingCustomers, 0),
    reportingCustomers,
    revenueVnd: Number(row?.revenueVnd) || 0,
    sourceRows: Number(row?.sourceRows) || 0,
    statementCount: Number(row?.statementCount) || 0,
    totalCustomers,
    trackCount: Number(row?.trackCount) || 0,
    units: Number(row?.units) || 0,
  };
}

async function readQuarterlyTrend(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT
         rp.period,
         COALESCE(SUM(s.net_revenue), 0) AS vnd,
         COALESCE(SUM(s.units), 0) AS units,
         COALESCE(SUM(s.row_count), 0) AS rowCount
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       WHERE rp.status IN ('published', 'locked')
         AND rp.currency = 'VND'
       GROUP BY rp.period
       ORDER BY rp.period DESC
       LIMIT 12`,
    )
    .all<QuarterlyTrendRow>();

  return rows.results
    .map((row) => ({
      label: periodDisplayLabel(row.period),
      period: row.period,
      rowCount: Number(row.rowCount) || 0,
      units: Number(row.units) || 0,
      vnd: Number(row.vnd) || 0,
    }))
    .reverse();
}

async function readTopCustomers(db: D1Database, period: string) {
  const rows = await db
    .prepare(
      `SELECT
         c.id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         MAX(rp.period) AS latestPeriod,
         COUNT(DISTINCT rp.id) AS statementCount,
         COALESCE(SUM(s.net_revenue), 0) AS vnd,
         COALESCE(SUM(s.units), 0) AS units,
         COALESCE(SUM(s.row_count), 0) AS rowCount
       FROM clients c
       LEFT JOIN report_periods rp
         ON rp.client_id = c.id
        AND rp.period = ?
        AND rp.status IN ('published', 'locked')
        AND rp.currency = 'VND'
       LEFT JOIN statements s
         ON s.report_period_id = rp.id
       WHERE c.status != 'archived'
       GROUP BY c.id, c.code, c.display_name
       ORDER BY vnd DESC, units DESC, c.display_name ASC
       LIMIT 8`,
    )
    .bind(period)
    .all<CustomerRankRow>();

  return rows.results.map((row) => ({
    clientCode: row.clientCode,
    clientId: row.clientId,
    clientName: row.clientName,
    latestPeriod: row.latestPeriod,
    rowCount: Number(row.rowCount) || 0,
    statementCount: Number(row.statementCount) || 0,
    units: Number(row.units) || 0,
    vnd: Number(row.vnd) || 0,
  }));
}

async function readDimensionTrend(
  db: D1Database,
  dimension: string,
  period: string,
  previousPeriod: string,
  mode: 'growth' | 'value' = 'growth',
) {
  const [currentRows, previousRows] = await Promise.all([
    readDimensionRows(db, dimension, period),
    readDimensionRows(db, dimension, previousPeriod),
  ]);
  const current = combineDimensionRows(currentRows);
  const previous = combineDimensionRows(previousRows);

  return Array.from(current.entries())
    .map(([label, item]) => {
      const previousItem = previous.get(label);
      const changeVnd = item.vnd - (previousItem?.vnd ?? 0);
      return {
        ...item,
        changeVnd,
        trend: trendDirection({
          changeVnd,
          previousVnd: previousItem?.vnd ?? 0,
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
  period: string,
) {
  const rows = await db
    .prepare(
      `SELECT
         rb.label,
         COALESCE(SUM(rb.value), 0) AS value,
         COALESCE(SUM(rb.units), 0) AS units,
         COALESCE(SUM(rb.row_count), 0) AS rowCount,
         COUNT(DISTINCT rb.client_id) AS clientCount
       FROM revenue_breakdowns rb
       JOIN report_periods rp
         ON rp.id = rb.report_period_id
       WHERE rp.period = ?
         AND rp.status IN ('published', 'locked')
         AND rp.currency = 'VND'
         AND rb.dimension = ?
       GROUP BY rb.label
       ORDER BY ABS(value) DESC
       LIMIT 120`,
    )
    .bind(period, dimension)
    .all<DimensionRankRow>();

  return rows.results;
}

function combineDimensionRows(rows: DimensionRankRow[]) {
  const byLabel = new Map<
    string,
    Omit<AdminTrendItem, 'changeVnd' | 'trend'>
  >();

  for (const row of rows) {
    const item = byLabel.get(row.label) ?? {
      clientCount: 0,
      label: row.label,
      rowCount: 0,
      units: 0,
      vnd: 0,
    };

    item.vnd += Number(row.value) || 0;
    item.clientCount = Math.max(item.clientCount, Number(row.clientCount) || 0);
    item.rowCount += Number(row.rowCount) || 0;
    item.units += Number(row.units) || 0;
    byLabel.set(row.label, item);
  }

  return byLabel;
}

function trendDirection(input: {
  changeVnd: number;
  previousVnd: number;
  vnd: number;
}): AdminTrendItem['trend'] {
  if (input.previousVnd === 0 && input.vnd > 0) return 'new';
  if (input.changeVnd > 0) return 'up';
  if (input.changeVnd < 0) return 'down';
  return 'flat';
}

function trendScore(item: AdminTrendItem, mode: 'growth' | 'value') {
  if (mode === 'value') return item.vnd;

  const growth = item.changeVnd > 0 ? item.changeVnd : 0;
  return growth + item.vnd * 0.08;
}

function fallbackBreakdownTrend(
  key: 'artists' | 'sources' | 'territories' | 'tracks',
) {
  return breakdownsByCurrency.VND[key].slice(0, 8).map((item, index) => ({
    changeVnd: index < 3 ? item.value * 0.12 : 0,
    clientCount: 1,
    label: item.name,
    rowCount: item.rows,
    trend: index < 3 ? ('up' as const) : ('flat' as const),
    units: item.units,
    vnd: item.value,
  }));
}
