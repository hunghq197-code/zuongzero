import { REPORT_PERIOD_PATTERN } from '@/lib/reporting-periods';
import { normalizeRoyaltyRuleIsrc } from '@/lib/royalty-rules';
import {
  readXlsxImportSheets,
  type XlsxCellMetadata,
} from '@/lib/xlsx-royalty-parser';

export const ROYALTY_RULE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const ROYALTY_RULE_IMPORT_MAX_ROWS = 500;

export type RoyaltyRuleImportIssue = {
  sheet: string;
  row: number;
  message: string;
};

export type RoyaltyRuleImportRow = {
  sheet: string;
  row: number;
  customerAccountNo: string;
  isrc: string;
  trackTitle: string;
  royaltyRateBps: number;
  effectiveFromPeriod: string;
  effectiveToPeriod: string | null;
};

type StoredClient = {
  id: string;
  code: string;
  name: string;
  status: string;
  updatedAt: string;
};
type StoredRule = {
  id: string;
  clientId: string;
  trackExternalKey: string;
  trackExternalId: string;
  trackTitle: string;
  royaltyRateBps: number;
  effectiveFromPeriod: string;
  effectiveToPeriod: string | null;
  status: string;
  notes: string | null;
  updatedAt: string;
};

export type RoyaltyRuleImportPreviewRow = RoyaltyRuleImportRow & {
  action: 'create' | 'update' | 'unchanged';
  clientId: string;
  clientName: string;
  ruleId: string | null;
  previous: StoredRule | null;
};

export type RoyaltyRuleImportPreview = {
  canCommit: boolean;
  issues: RoyaltyRuleImportIssue[];
  rows: RoyaltyRuleImportPreviewRow[];
  summary: { create: number; update: number; unchanged: number; total: number };
  previewToken: string | null;
};

export class RoyaltyRuleImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const aliases: Record<string, string[]> = {
  customerAccountNo: [
    'customeraccountno',
    'accountno',
    'clientcode',
    'makhachhang',
  ],
  isrc: ['isrc'],
  trackTitle: ['tracktitle', 'songtitle', 'tenbaihat'],
  percent: ['percent', 'royaltyrate', 'royaltypercent', 'tyle'],
  effectiveFromPeriod: ['effectivefromperiod', 'effectivefrom', 'tuquy'],
  effectiveToPeriod: ['effectivetoperiod', 'effectiveto', 'denquy'],
};

export function parseRoyaltyRulePercent(
  value: string,
  metadata?: XlsxCellMetadata,
) {
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*%?$/.test(text)) return null;
  let percent = Number(text.replace(/\s*%$/, '').replace(',', '.'));
  if (metadata?.percentage && metadata.type === 'n' && !text.endsWith('%'))
    percent *= 100;
  const bps = Math.round(percent * 100);
  if (
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100 ||
    Math.abs(bps - percent * 100) > 0.000001
  )
    return null;
  return bps;
}

export function parseRoyaltyRuleImport(buffer: ArrayBuffer) {
  if (!buffer.byteLength || buffer.byteLength > ROYALTY_RULE_IMPORT_MAX_BYTES) {
    throw new RoyaltyRuleImportError(
      'File phải có dữ liệu và không vượt quá 2 MB.',
    );
  }
  const rows: RoyaltyRuleImportRow[] = [];
  const issues: RoyaltyRuleImportIssue[] = [];
  let total = 0;
  let sheets: ReturnType<typeof readXlsxImportSheets>;
  try {
    sheets = readXlsxImportSheets(buffer);
  } catch (error) {
    throw new RoyaltyRuleImportError(
      error instanceof Error
        ? `Không đọc được XLSX: ${error.message}`
        : 'Không đọc được XLSX.',
    );
  }
  for (const sheet of sheets) {
    const populated = sheet.rows.filter(
      (row) =>
        row.cells.some((cell) => cell.trim()) ||
        Object.values(row.metadata ?? {}).some((cell) => cell.formula),
    );
    if (!populated.length) continue;
    const header = populated[0];
    const columns: Record<string, number> = {};
    const startIssues = issues.length;
    header.cells.forEach((cell, index) => {
      const key = cell
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const field = Object.keys(aliases).find((name) =>
        aliases[name].includes(key),
      );
      if (!field) return;
      if (field in columns)
        issues.push({
          sheet: sheet.name,
          row: header.index,
          message: `Cột ${field} bị lặp.`,
        });
      columns[field] = index;
    });
    for (const field of [
      'customerAccountNo',
      'isrc',
      'percent',
      'effectiveFromPeriod',
    ]) {
      if (!(field in columns))
        issues.push({
          sheet: sheet.name,
          row: header.index,
          message: `Thiếu cột ${field}.`,
        });
    }
    if (issues.length !== startIssues) continue;
    for (const source of populated.slice(1)) {
      total += 1;
      if (total > ROYALTY_RULE_IMPORT_MAX_ROWS)
        throw new RoyaltyRuleImportError('Mỗi lượt nhập tối đa 500 dòng.');
      const issue = (message: string) =>
        issues.push({ sheet: sheet.name, row: source.index, message });
      const before = issues.length;
      const cell = (field: string) =>
        (source.cells[columns[field]] ?? '').trim();
      for (const [field, column] of Object.entries(columns)) {
        const meta = source.metadata?.[column];
        if (meta?.formula || (meta && ['e', 'b'].includes(meta.type)))
          issue(
            `Cột ${field} chứa công thức, lỗi Excel hoặc giá trị boolean; cần giá trị trực tiếp.`,
          );
      }
      const customerAccountNo = cell('customerAccountNo').toUpperCase();
      const isrc = cell('isrc').toUpperCase().replace(/[\s-]/g, '');
      const trackTitle = cell('trackTitle');
      const effectiveFromPeriod = cell('effectiveFromPeriod');
      const effectiveToPeriod = cell('effectiveToPeriod') || null;
      const royaltyRateBps = parseRoyaltyRulePercent(
        cell('percent'),
        source.metadata?.[columns.percent],
      );
      if (!customerAccountNo || customerAccountNo.length > 120)
        issue('customerAccountNo không hợp lệ.');
      if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))
        issue('ISRC phải gồm 12 ký tự hợp lệ (có thể có dấu gạch ngang).');
      if (trackTitle.length > 220)
        issue('Tên bài hát không được vượt quá 220 ký tự.');
      if (royaltyRateBps === null)
        issue('Tỷ lệ phải từ 0 đến 100%, tối đa 2 chữ số thập phân.');
      if (!REPORT_PERIOD_PATTERN.test(effectiveFromPeriod))
        issue('Quý bắt đầu phải có dạng YYYY-Q1 đến YYYY-Q4.');
      if (
        effectiveToPeriod &&
        (!REPORT_PERIOD_PATTERN.test(effectiveToPeriod) ||
          effectiveToPeriod < effectiveFromPeriod)
      )
        issue('Quý kết thúc không hợp lệ hoặc trước quý bắt đầu.');
      if (issues.length === before)
        rows.push({
          sheet: sheet.name,
          row: source.index,
          customerAccountNo,
          isrc,
          trackTitle,
          royaltyRateBps: royaltyRateBps!,
          effectiveFromPeriod,
          effectiveToPeriod,
        });
    }
  }
  if (!total && !issues.length)
    issues.push({
      sheet: '',
      row: 0,
      message: 'File chưa có dòng tỷ lệ chia.',
    });
  return { rows, issues, total };
}

// A deterministic snapshot of every matching client and rule, without UI list limits.
// The identical query is rechecked inside the write transaction to close the read/write race.
const snapshotSql = `SELECT json_object(
  'clients', json((SELECT json_group_array(json_object(
    'id', id, 'code', code, 'name', display_name, 'status', status, 'updatedAt', updated_at
  )) FROM (SELECT c.* FROM clients c WHERE EXISTS (
    SELECT 1 FROM json_each(?1) i WHERE upper(c.code) = json_extract(i.value, '$.customerAccountNo')
  ) ORDER BY c.id))),
  'rules', json((SELECT json_group_array(json_object(
    'id', id, 'clientId', client_id, 'trackExternalKey', track_external_key,
    'trackExternalId', track_external_id, 'trackTitle', track_title,
    'royaltyRateBps', royalty_rate_bps, 'effectiveFromPeriod', effective_from_period,
    'effectiveToPeriod', effective_to_period, 'status', status, 'notes', notes, 'updatedAt', updated_at
  )) FROM (SELECT r.* FROM track_royalty_rules r JOIN clients c ON c.id = r.client_id
    WHERE EXISTS (SELECT 1 FROM json_each(?1) i
      WHERE upper(c.code) = json_extract(i.value, '$.customerAccountNo')
        AND r.track_external_key = lower(json_extract(i.value, '$.isrc')))
    ORDER BY r.id)))
) AS snapshot`;

export async function previewRoyaltyRuleImport(
  db: D1Database,
  buffer: ArrayBuffer,
  actorEmail: string,
) {
  const parsed = parseRoyaltyRuleImport(buffer);
  const scope = JSON.stringify(
    parsed.rows.map(({ customerAccountNo, isrc }) => ({
      customerAccountNo,
      isrc,
    })),
  );
  const result = await db
    .prepare(snapshotSql)
    .bind(scope)
    .first<{ snapshot: string }>();
  if (!result) throw new Error('Missing import snapshot');
  const snapshot = result.snapshot;
  const stored = JSON.parse(snapshot) as {
    clients: StoredClient[];
    rules: StoredRule[];
  };
  const issues = [...parsed.issues];
  const rows: RoyaltyRuleImportPreviewRow[] = [];
  const summary = { create: 0, update: 0, unchanged: 0, total: parsed.total };
  for (const row of parsed.rows) {
    const issue = (message: string) =>
      issues.push({ sheet: row.sheet, row: row.row, message });
    const clients = stored.clients.filter(
      (client) => client.code.toUpperCase() === row.customerAccountNo,
    );
    if (
      clients.length !== 1 ||
      !['active', 'locked'].includes(clients[0].status)
    ) {
      issue('Mã khách hàng không tồn tại, không duy nhất hoặc đã lưu trữ.');
      continue;
    }
    const client = clients[0];
    const pairRules = stored.rules.filter(
      (rule) =>
        rule.clientId === client.id &&
        rule.trackExternalKey === normalizeRoyaltyRuleIsrc(row.isrc),
    );
    const targets = pairRules.filter(
      (rule) => rule.effectiveFromPeriod === row.effectiveFromPeriod,
    );
    if (targets.length > 1) {
      issue(
        'Có nhiều quy tắc cùng khách hàng, ISRC và quý bắt đầu; cần xử lý trước khi nhập.',
      );
      continue;
    }
    const previous = targets[0] ?? null;
    if (
      pairRules.some(
        (rule) =>
          rule.status === 'active' &&
          rule.id !== previous?.id &&
          overlaps(row, rule),
      )
    ) {
      issue('Khoảng hiệu lực chồng lấn với tỷ lệ đang áp dụng.');
    }
    const conflicts = parsed.rows.filter(
      (other) =>
        other !== row &&
        other.customerAccountNo === row.customerAccountNo &&
        other.isrc === row.isrc &&
        overlaps(row, other),
    );
    if (conflicts.length)
      issue(
        `Trùng hoặc chồng lấn với ${conflicts.map((other) => `${other.sheet}, dòng ${other.row}`).join('; ')}.`,
      );
    const trackTitle = row.trackTitle || previous?.trackTitle || row.isrc;
    const action = !previous
      ? 'create'
      : previous.status === 'active' &&
          previous.royaltyRateBps === row.royaltyRateBps &&
          previous.effectiveToPeriod === row.effectiveToPeriod &&
          previous.trackTitle === trackTitle &&
          previous.trackExternalId === row.isrc
        ? 'unchanged'
        : 'update';
    rows.push({
      ...row,
      trackTitle,
      action,
      clientId: client.id,
      clientName: client.name,
      ruleId: previous?.id ?? null,
      previous,
    });
    summary[action] += 1;
  }
  const canCommit = !issues.length && rows.length > 0;
  // Bind confirmation to the exact workbook, resolved records, and signed-in administrator.
  const fileHash = await digest(buffer);
  const previewToken = canCommit
    ? await digest(
        new TextEncoder().encode(
          JSON.stringify([
            actorEmail.trim().toLowerCase(),
            fileHash,
            snapshot,
            rows,
          ]),
        ).buffer,
      )
    : null;
  const preview: RoyaltyRuleImportPreview = {
    canCommit,
    issues,
    rows,
    summary,
    previewToken,
  };
  return { preview, scope, snapshot };
}

export async function commitRoyaltyRuleImport(
  db: D1Database,
  prepared: Awaited<ReturnType<typeof previewRoyaltyRuleImport>>,
  actorId: string,
) {
  const { preview, scope, snapshot } = prepared;
  if (!preview.canCommit)
    throw new RoyaltyRuleImportError('File còn lỗi; chưa nhập dòng nào.', 422);
  const now = new Date().toISOString();
  const importId = crypto.randomUUID();
  const mutations = preview.rows
    .filter((row) => row.action !== 'unchanged')
    .map((row) => ({
      ...row,
      id: row.ruleId ?? crypto.randomUUID(),
      trackExternalKey: normalizeRoyaltyRuleIsrc(row.isrc),
      auditId: crypto.randomUUID(),
    }));
  const payload = JSON.stringify(mutations);
  try {
    await db.batch([
      // NOT NULL intentionally aborts the entire batch if any snapshotted data changed.
      db
        .prepare(`INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, created_at)
        VALUES (?3, CASE WHEN (${snapshotSql}) = ?2 THEN ?4 ELSE NULL END,
          'track_royalty_rules_imported', 'track_royalty_rule_import', ?3, ?5, ?6)`)
        .bind(
          scope,
          snapshot,
          importId,
          actorId,
          JSON.stringify(preview.summary),
          now,
        ),
      db
        .prepare(`INSERT INTO track_royalty_rules (
        id, client_id, track_title, track_external_id, track_external_key, royalty_rate_bps,
        effective_from_period, effective_to_period, status, created_by_user_id, created_at, updated_at
      ) SELECT json_extract(value, '$.id'), json_extract(value, '$.clientId'),
        json_extract(value, '$.trackTitle'), json_extract(value, '$.isrc'), json_extract(value, '$.trackExternalKey'),
        json_extract(value, '$.royaltyRateBps'), json_extract(value, '$.effectiveFromPeriod'),
        json_extract(value, '$.effectiveToPeriod'), 'active', ?2, ?3, ?3
      FROM json_each(?1) WHERE 1
      ON CONFLICT(id) DO UPDATE SET track_title = excluded.track_title, track_external_id = excluded.track_external_id,
        royalty_rate_bps = excluded.royalty_rate_bps, effective_to_period = excluded.effective_to_period,
        status = 'active', updated_at = excluded.updated_at`)
        .bind(payload, actorId, now),
      db
        .prepare(`INSERT INTO audit_logs (id, actor_user_id, client_id, action, target_type, target_id, metadata, created_at)
        SELECT json_extract(value, '$.auditId'), ?2, json_extract(value, '$.clientId'),
          CASE json_extract(value, '$.action') WHEN 'create' THEN 'track_royalty_rule_created' ELSE 'track_royalty_rule_updated' END,
          'track_royalty_rule', json_extract(value, '$.id'), json_set(value, '$.importId', ?3), ?4
        FROM json_each(?1)`)
        .bind(payload, actorId, importId, now),
    ]);
  } catch (error) {
    const cause =
      error instanceof Error
        ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
        : '';
    if (
      cause.includes('NOT NULL constraint failed: audit_logs.actor_user_id')
    ) {
      throw new RoyaltyRuleImportError(
        'Dữ liệu đã thay đổi. Hãy xem trước lại; chưa nhập dòng nào.',
        409,
      );
    }
    throw error;
  }
  return { importId, summary: preview.summary };
}

function overlaps(
  left: Pick<RoyaltyRuleImportRow, 'effectiveFromPeriod' | 'effectiveToPeriod'>,
  right: Pick<
    RoyaltyRuleImportRow,
    'effectiveFromPeriod' | 'effectiveToPeriod'
  >,
) {
  return (
    left.effectiveFromPeriod <= (right.effectiveToPeriod ?? '9999-Q4') &&
    right.effectiveFromPeriod <= (left.effectiveToPeriod ?? '9999-Q4')
  );
}

async function digest(buffer: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
