import type { StatementLineItem } from '@/lib/statement-line-items';

export type TrackRoyaltyRuleStatus = 'active' | 'inactive';
export type StatementCalculationMode = 'excel' | 'track_rule';

export type TrackRoyaltyRuleRow = {
  clientCode: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  createdByEmail: string | null;
  effectiveFromPeriod: string;
  effectiveToPeriod: string | null;
  id: string;
  notes: string | null;
  royaltyRateBps: number;
  status: TrackRoyaltyRuleStatus;
  trackExternalId: string;
  trackTitle: string;
  updatedAt: string;
};

export type ApplicableTrackRoyaltyRule = Pick<
  TrackRoyaltyRuleRow,
  'id' | 'royaltyRateBps' | 'trackExternalId' | 'trackTitle'
>;

export type RoyaltyRuleApplicationStats = {
  excelRows: number;
  ruleGrossIncome: number;
  ruleNetPayable: number;
  ruleRows: number;
};

export type RoyaltyRuleApplicationIssue = {
  isrc: string;
  message: string;
  rowIndex: number;
  trackTitle: string;
};

export type RoyaltyRuleApplicationResult = {
  issues: RoyaltyRuleApplicationIssue[];
  items: StatementLineItem[];
  stats: RoyaltyRuleApplicationStats;
};

type TrackRoyaltyRuleDbRow = TrackRoyaltyRuleRow;

export async function hasTrackRoyaltyRulesTable(db: D1Database) {
  try {
    const row = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name = 'track_royalty_rules'
         LIMIT 1`,
      )
      .first<{ name: string }>();

    return Boolean(row?.name);
  } catch {
    return false;
  }
}

export async function listTrackRoyaltyRules(
  db: D1Database,
  filters: {
    clientId?: string | null;
    limit?: number;
    status?: TrackRoyaltyRuleStatus | 'all' | null;
  } = {},
): Promise<TrackRoyaltyRuleRow[]> {
  if (!(await hasTrackRoyaltyRulesTable(db))) return [];

  const clauses = ['1 = 1'];
  const bindings: Array<number | string> = [];
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 500), 1), 1000);

  if (filters.clientId) {
    clauses.push('r.client_id = ?');
    bindings.push(filters.clientId);
  }

  if (filters.status && filters.status !== 'all') {
    clauses.push('r.status = ?');
    bindings.push(filters.status);
  }

  const rows = await db
    .prepare(
      `SELECT
         r.id,
         r.client_id AS clientId,
         c.code AS clientCode,
         c.display_name AS clientName,
         r.track_title AS trackTitle,
         r.track_external_id AS trackExternalId,
         r.royalty_rate_bps AS royaltyRateBps,
         r.effective_from_period AS effectiveFromPeriod,
         r.effective_to_period AS effectiveToPeriod,
         r.status,
         r.notes,
         r.created_at AS createdAt,
         r.updated_at AS updatedAt,
         u.email AS createdByEmail
       FROM track_royalty_rules r
       JOIN clients c
         ON c.id = r.client_id
       LEFT JOIN users u
         ON u.id = r.created_by_user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY
         CASE r.status WHEN 'active' THEN 0 ELSE 1 END,
         r.updated_at DESC
       LIMIT ?`,
    )
    .bind(...bindings, limit)
    .all<TrackRoyaltyRuleDbRow>();

  return rows.results.map(mapTrackRoyaltyRuleRow);
}

export async function listApplicableTrackRoyaltyRules(
  db: D1Database,
  clientId: string,
  period: string,
): Promise<ApplicableTrackRoyaltyRule[]> {
  if (!(await hasTrackRoyaltyRulesTable(db))) return [];

  const rows = await db
    .prepare(
      `SELECT
         id,
         track_title AS trackTitle,
         track_external_id AS trackExternalId,
         royalty_rate_bps AS royaltyRateBps
       FROM track_royalty_rules
       WHERE client_id = ?
         AND status = 'active'
         AND effective_from_period <= ?
         AND (effective_to_period IS NULL OR effective_to_period >= ?)
       ORDER BY effective_from_period DESC, updated_at DESC`,
    )
    .bind(clientId, period, period)
    .all<ApplicableTrackRoyaltyRule>();

  return rows.results.map((row) => ({
    id: row.id,
    royaltyRateBps: Number(row.royaltyRateBps) || 0,
    trackExternalId: row.trackExternalId,
    trackTitle: row.trackTitle,
  }));
}

export function applyTrackRoyaltyRules(
  items: StatementLineItem[],
  rules: ApplicableTrackRoyaltyRule[],
): RoyaltyRuleApplicationResult {
  const rulesByIsrc = new Map<string, ApplicableTrackRoyaltyRule>();
  for (const rule of rules) {
    const key = normalizeRoyaltyRuleIsrc(rule.trackExternalId);
    if (key && !rulesByIsrc.has(key)) rulesByIsrc.set(key, rule);
  }

  const issues: RoyaltyRuleApplicationIssue[] = [];
  const stats: RoyaltyRuleApplicationStats = {
    excelRows: 0,
    ruleGrossIncome: 0,
    ruleNetPayable: 0,
    ruleRows: 0,
  };

  const appliedItems = items.map((item) => {
    const sourceNetPayable = item.sourceNetPayable ?? item.netPayable;
    const sourceRoyaltyRate = item.sourceRoyaltyRate ?? item.royaltyRate;
    const rule = item.isrc
      ? rulesByIsrc.get(normalizeRoyaltyRuleIsrc(item.isrc))
      : undefined;

    if (!rule) {
      stats.excelRows += 1;
      return {
        ...item,
        appliedRoyaltyRateBps: null,
        calculationMode: 'excel' as const,
        netPayable: sourceNetPayable,
        royaltyRate: sourceRoyaltyRate,
        royaltyRuleId: null,
        sourceNetPayable,
        sourceRoyaltyRate,
      };
    }

    if (item.grossIncome === null || !Number.isFinite(item.grossIncome)) {
      issues.push({
        isrc: item.isrc ?? '',
        message: 'Bài hát có tỷ lệ riêng nhưng thiếu Gross Income.',
        rowIndex: item.rowIndex,
        trackTitle: item.trackTitle ?? rule.trackTitle,
      });
      return {
        ...item,
        sourceNetPayable,
        sourceRoyaltyRate,
      };
    }

    const netPayable = roundMoney(
      (item.grossIncome * rule.royaltyRateBps) / 10_000,
    );
    stats.ruleRows += 1;
    stats.ruleGrossIncome = roundMoney(
      stats.ruleGrossIncome + item.grossIncome,
    );
    stats.ruleNetPayable = roundMoney(stats.ruleNetPayable + netPayable);

    return {
      ...item,
      appliedRoyaltyRateBps: rule.royaltyRateBps,
      calculationMode: 'track_rule' as const,
      netPayable,
      royaltyRate: royaltyRateBpsToPercent(rule.royaltyRateBps),
      royaltyRuleId: rule.id,
      sourceNetPayable,
      sourceRoyaltyRate,
    };
  });

  return { issues, items: appliedItems, stats };
}

export function royaltyRateBpsToPercent(bps: number) {
  return Math.round(bps) / 100;
}

export function royaltyPercentToBps(percent: number) {
  return Math.round(percent * 100);
}

export function isValidRoyaltyRateBps(bps: number) {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000;
}

export function normalizeRoyaltyRuleIsrc(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapTrackRoyaltyRuleRow(
  row: TrackRoyaltyRuleDbRow,
): TrackRoyaltyRuleRow {
  return {
    ...row,
    royaltyRateBps: Number(row.royaltyRateBps) || 0,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
