type SqlValue = string | number | null;
const MAX_JSON_BYTES = 512 * 1024;

export const lineItemColumns = [
  'id',
  'client_id',
  'report_period_id',
  'source_upload_id',
  'row_index',
  'account_no',
  'contract_name',
  'content_type',
  'start_date',
  'period_end_date',
  'release_title',
  'release_artist',
  'isrc',
  'track_title',
  'track_version',
  'track_artist',
  'sales_period',
  'release_label',
  'territory',
  'distribution_channel',
  'configuration',
  'partner',
  'sales',
  'gross_income',
  'royalty_rate',
  'net_payable',
  'source_royalty_rate',
  'source_net_payable',
  'calculation_mode',
  'royalty_rule_id',
  'applied_royalty_rate_bps',
  'currency',
  'created_at',
] as const;
export const breakdownColumns = [
  'id',
  'client_id',
  'report_period_id',
  'dimension',
  'label',
  'value',
  'percentage',
  'units',
  'row_count',
  'created_at',
] as const;
export const recoupmentColumns = [
  'id',
  'guarantee_id',
  'client_id',
  'report_period_id',
  'source_upload_id',
  'track_title',
  'revenue_amount',
  'amount',
  'created_at',
] as const;

// JSON rows keep parameter/query counts bounded without changing source values.
export function buildStatementBulkInserts(
  db: D1Database,
  table:
    | 'statement_line_items'
    | 'revenue_breakdowns'
    | 'track_guarantee_recoupments',
  rows: SqlValue[][],
) {
  const columns =
    table === 'statement_line_items'
      ? lineItemColumns
      : table === 'revenue_breakdowns'
        ? breakdownColumns
        : recoupmentColumns;
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${columns
    .map((_, index) => `json_extract(value, '$[${index}]')`)
    .join(', ')} FROM json_each(?)`;
  const statements: D1PreparedStatement[] = [];
  let chunk: string[] = [];
  let bytes = 2;
  const encoder = new TextEncoder();
  for (const row of rows) {
    if (row.length !== columns.length)
      throw new Error('Invalid statement row width');
    const json = JSON.stringify(row);
    const size = encoder.encode(json).byteLength + 1;
    if (size > MAX_JSON_BYTES)
      throw new Error('Statement row exceeds safe size');
    if (bytes + size > MAX_JSON_BYTES && chunk.length) {
      statements.push(db.prepare(sql).bind(`[${chunk.join(',')}]`));
      chunk = [];
      bytes = 2;
    }
    chunk.push(json);
    bytes += size;
  }
  if (chunk.length)
    statements.push(db.prepare(sql).bind(`[${chunk.join(',')}]`));
  return statements;
}
