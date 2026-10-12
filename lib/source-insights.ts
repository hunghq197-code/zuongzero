import type { BreakdownItem } from './dashboard-data';

export type SourceInsights = {
  configurations: BreakdownItem[];
  contentTypes: BreakdownItem[];
  contracts: BreakdownItem[];
  releaseArtists: BreakdownItem[];
  trackIdentities: Array<{
    isrc: string;
    netPayable: number;
    sales: number;
    trackTitle: string;
    trackVersion: string | null;
  }>;
};

type DimensionRow = {
  period: string;
  dimension: 'configurations' | 'contentTypes' | 'contracts' | 'releaseArtists';
  name: string;
  value: number;
  units: number;
  rows: number;
};

export async function readSourceInsights(db: D1Database, clientId: string) {
  const [dimensions, tracks] = await Promise.all([
    db
      .prepare(`WITH source AS (
      SELECT rp.period, li.configuration, li.content_type, li.contract_name, li.release_artist, li.net_payable, li.sales
      FROM statement_line_items li JOIN report_periods rp ON rp.id = li.report_period_id
      WHERE li.client_id = ?1 AND rp.client_id = ?1 AND rp.currency = 'VND' AND rp.status IN ('published','locked')
    ), groups AS (
      SELECT period, 'configurations' AS dimension, trim(configuration) AS name, net_payable, sales FROM source
      UNION ALL SELECT period, 'contentTypes', trim(content_type), net_payable, sales FROM source
      UNION ALL SELECT period, 'contracts', trim(contract_name), net_payable, sales FROM source
      UNION ALL SELECT period, 'releaseArtists', trim(release_artist), net_payable, sales FROM source
    ) SELECT period, dimension, name, SUM(net_payable) AS value, SUM(sales) AS units, COUNT(*) AS rows
      FROM groups WHERE name IS NOT NULL AND name != '' GROUP BY period, dimension, name
      ORDER BY period DESC, dimension, abs(SUM(net_payable)) DESC, name`)
      .bind(clientId)
      .all<DimensionRow>(),
    db
      .prepare(`SELECT rp.period, COALESCE(NULLIF(trim(li.isrc),''), '-') AS isrc,
      COALESCE(MIN(NULLIF(trim(li.track_title),'')), '-') AS trackTitle,
      MIN(NULLIF(trim(li.track_version),'')) AS trackVersion,
      SUM(li.net_payable) AS netPayable, SUM(li.sales) AS sales
      FROM statement_line_items li JOIN report_periods rp ON rp.id = li.report_period_id
      WHERE li.client_id = ?1 AND rp.client_id = ?1 AND rp.currency = 'VND' AND rp.status IN ('published','locked')
        AND (NULLIF(trim(li.isrc),'') IS NOT NULL OR NULLIF(trim(li.track_title),'') IS NOT NULL)
      GROUP BY rp.period, CASE WHEN NULLIF(trim(li.isrc),'') IS NOT NULL THEN trim(li.isrc)
        ELSE trim(li.track_title) || ':' || COALESCE(li.track_version, '') END
      ORDER BY rp.period DESC, abs(SUM(li.net_payable)) DESC, isrc, trackTitle`)
      .bind(clientId)
      .all<SourceInsights['trackIdentities'][number] & { period: string }>(),
  ]);
  const result: Record<string, SourceInsights> = {};
  const get = (period: string) =>
    (result[period] ??= {
      configurations: [],
      contentTypes: [],
      contracts: [],
      releaseArtists: [],
      trackIdentities: [],
    });
  for (const row of dimensions.results) {
    get(row.period)[row.dimension].push({
      name: row.name,
      value: Number(row.value) || 0,
      units: Number(row.units) || 0,
      rows: Number(row.rows) || 0,
      percentage: 0,
    });
  }
  for (const row of tracks.results) {
    get(row.period).trackIdentities.push({
      isrc: row.isrc,
      trackTitle: row.trackTitle,
      trackVersion: row.trackVersion,
      netPayable: Number(row.netPayable) || 0,
      sales: Number(row.sales) || 0,
    });
  }
  for (const insights of Object.values(result)) {
    for (const dimension of [
      'configurations',
      'contentTypes',
      'contracts',
      'releaseArtists',
    ] as const) {
      const total = insights[dimension].reduce(
        (sum, row) => sum + Math.abs(row.value),
        0,
      );
      for (const row of insights[dimension])
        row.percentage = total ? (Math.abs(row.value) / total) * 100 : 0;
    }
  }
  return result;
}
