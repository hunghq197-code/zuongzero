import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { before, beforeEach, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
await build({
  absWorkingDir: root,
  stdin: {
    contents: `export * from './lib/statement-balances'; export * from './lib/sales-periods'; export * from './lib/royalty-rule-import'; export * from './lib/statement-export-files'; export * from './lib/xlsx-royalty-parser';`,
    resolveDir: root,
  },
  bundle: true,
  outfile: 'outputs/business-helpers.mjs',
  format: 'esm',
  platform: 'node',
});
const {
  calculateStatementBalances,
  normalizeSalesMonth,
  aggregateSalesPeriods,
  parseRoyaltyRuleImport,
  previewRoyaltyRuleImport,
  commitRoyaltyRuleImport,
  buildTabularXlsx,
  parseRoyaltyWorkbook,
} = await import(
  pathToFileURL(join(root, 'outputs/business-helpers.mjs')).href
);
const headers = [
  'Account No.',
  'ISRC',
  'Track Title',
  'Royalty Rate',
  'Effective From',
  'Effective To',
];
const ruleRow = ['A001', 'VNABC2600001', 'Song A', '80%', '2026-Q3', ''];
function workbook(rows = [ruleRow], columns = headers) {
  return buildTabularXlsx(columns, rows).body;
}
function buffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}
let mf, db;
before(async () => {
  const bundle = await build({
    absWorkingDir: root,
    entryPoints: ['tests/business/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers', 'node:net'],
    plugins: [
      {
        name: 'test-identity',
        setup(build) {
          build.onResolve({ filter: /^@\/app\/chatgpt-auth$/ }, () => ({
            path: join(root, 'tests/business/identity.ts'),
          }));
        },
      },
    ],
  });
  mf = new Miniflare({
    script: bundle.outputFiles[0].text,
    modules: true,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    r2Buckets: ['FILES'],
    log: new Log(LogLevel.ERROR),
    bindings: {
      SUPER_ADMIN_EMAILS: 'admin@test.invalid',
      AUTH_PROVIDER: 'app-session',
    },
    outboundService: () => {
      throw new Error('No outbound network permitted');
    },
  });
  db = await mf.getD1Database('DB');
  for (const file of (await readdir(join(root, 'drizzle')))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const sql of (
      await readFile(join(root, 'drizzle', file), 'utf8')
    ).split('--> statement-breakpoint'))
      if (sql.trim()) await db.prepare(sql).run();
  }
  await db
    .prepare(
      `INSERT INTO users (id,email,display_name,role,status,created_at) VALUES ('admin','admin@test.invalid','Admin','super_admin','active','2026-01-01'), ('viewer','viewer@test.invalid','Viewer','client','active','2026-01-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO clients (id,code,legal_name,display_name,default_currency,status,created_at,updated_at) VALUES ('a','A001','Artist A','Artist A','VND','active','2026-01-01','2026-01-01'), ('b','B001','Artist B','Artist B','VND','active','2026-01-01','2026-01-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO client_users (id,client_id,user_id,access_level,status,created_at) VALUES ('link','a','viewer','owner','active','2026-01-01')`,
    )
    .run();
});
beforeEach(async () => {
  for (const table of [
    'audit_logs',
    'track_royalty_rules',
    'track_guarantee_recoupments',
    'track_guarantees',
    'statement_line_items',
    'revenue_breakdowns',
    'statements',
    'uploads',
    'report_periods',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  await db
    .prepare("UPDATE clients SET status='active', updated_at='2026-01-01'")
    .run();
});
after(async () => {
  await mf?.dispose();
});

async function request(path, options = {}, email = 'admin@test.invalid') {
  if (options.body instanceof FormData) {
    const native = new Request(`https://business.test${path}`, options);
    options = {
      ...options,
      body: await native.arrayBuffer(),
      headers: Object.fromEntries(native.headers),
    };
  }
  return mf.dispatchFetch(`https://business.test${path}`, {
    ...options,
    headers: { 'x-test-email': email, ...options.headers },
  });
}
async function importRequest(
  bytes,
  action = 'preview',
  previewToken = '',
  email,
) {
  const body = new FormData();
  body.set('file', new Blob([bytes]), 'rules.xlsx');
  body.set('action', action);
  body.set('previewToken', previewToken);
  return request('/rules', { method: 'POST', body }, email);
}
async function statement(id, quarter, revenue, options = {}) {
  const {
    client = 'a',
    opening = 0,
    paid = false,
    status = 'published',
    costs = 0,
  } = options;
  await db
    .prepare(
      `INSERT INTO report_periods (id,client_id,period,currency,status,payment_status,created_at,updated_at) VALUES (?,?,?,'VND',?,?, '2026-01-01','2026-01-01')`,
    )
    .bind(id, client, quarter, status, paid ? 'paid' : 'unpaid')
    .run();
  await db
    .prepare(
      `INSERT INTO uploads (id,client_id,report_period_id,uploaded_by_user_id,original_filename,object_key,content_type,byte_size,sha256,status,created_at) VALUES (?,?,?,'admin','test.xlsx',?,'xlsx',1,'hash','imported','2026-01-01')`,
    )
    .bind(`u-${id}`, client, id, `files/${id}`)
    .run();
  await db
    .prepare(
      `INSERT INTO statements (id,client_id,report_period_id,source_upload_id,opening_balance,gross_revenue,net_revenue,net_costs,reserves_withheld,reserves_released,closing_balance,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,0,0,0,'2026-01-01','2026-01-01')`,
    )
    .bind(`s-${id}`, client, id, `u-${id}`, opening, revenue, revenue, costs)
    .run();
}
async function action(id, action) {
  return request('/statements', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportPeriodId: id, action }),
  });
}

void test('unpaid balance crosses the threshold and multiple quarters without duplication', () => {
  const row = (id, revenue, extra = {}) => ({
    id,
    clientId: 'a',
    period: `2026-Q${id}`,
    revenue,
    opening: 999,
    costs: 0,
    reservesWithheld: 0,
    reservesReleased: 0,
    status: 'published',
    paymentStatus: 'unpaid',
    ...extra,
  });
  const balances = calculateStatementBalances([
    row('3', 200_000),
    row('1', 600_000),
    row('2', 700_000),
  ]);
  assert.deepEqual(balances.get('3'), {
    opening: 1_300_000,
    closing: 1_500_000,
    paid: 0,
  });
  assert.equal(balances.get('1').opening, 0);
  const paid = calculateStatementBalances([
    row('1', 600_000),
    row('2', 1_200_000, { opening: 0, paymentStatus: 'paid' }),
    row('3', 200_000),
  ]);
  assert.deepEqual(paid.get('2'), {
    opening: 600_000,
    closing: 600_000,
    paid: 1_200_000,
  });
  assert.equal(paid.get('3').opening, 600_000);
});

void test('D1 payments snapshot the derived opening, clear following carry, and protect settled successors', async () => {
  await statement('q1', '2026-Q1', 600_000);
  await statement('q2', '2026-Q2', 700_000);
  await statement('q3', '2026-Q3', 200_000);
  assert.equal(
    (await (await request('/balances')).json()).q3.opening,
    1_300_000,
  );
  const response = await action('q2', 'mark_paid');
  assert.equal(response.status, 200, await response.text());
  const stored = await db
    .prepare(
      "SELECT opening_balance FROM statements WHERE report_period_id='q2'",
    )
    .first();
  assert.equal(stored.opening_balance, 600_000);
  const balances = await (await request('/balances')).json();
  assert.deepEqual(balances.q2, {
    opening: 600_000,
    closing: 0,
    paid: 1_300_000,
  });
  assert.equal(balances.q3.opening, 0);
  assert.equal((await action('q1', 'unpublish')).status, 409);
  assert.equal(
    (
      await request('/statements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportPeriodId: 'q1' }),
      })
    ).status,
    409,
  );
  assert.equal((await action('q2', 'mark_paid')).status, 200);
  assert.equal((await action('q2', 'mark_unpaid')).status, 200);
  assert.equal(
    (await (await request('/balances')).json()).q3.opening,
    1_300_000,
  );
});

void test('hidden periods and other customers do not seed stale balances', async () => {
  await statement('q1', '2026-Q1', 600_000, { status: 'replaced' });
  await statement('q2', '2026-Q2', 700_000, { opening: 600_000 });
  await statement('other', '2026-Q1', 9_000_000, { client: 'b' });
  const balances = await (await request('/balances')).json();
  assert.equal(balances.q2.opening, 0);
  assert.equal(balances.q2.closing, 700_000);
  assert.equal((await action('q1', 'mark_paid')).status, 409);
});

void test('locked successors reject backdated changes and sub-threshold payment stays blocked', async () => {
  await statement('q1', '2026-Q1', 100_000);
  assert.equal((await action('q1', 'mark_paid')).status, 400);
  await statement('q2', '2026-Q2', 100_000, { status: 'locked' });
  assert.equal((await action('q1', 'unpublish')).status, 409);
});

void test('client dashboard and reminders use the same actual unpaid ledger', async () => {
  await statement('q1', '2026-Q1', 1_200_000);
  await statement('q2', '2026-Q2', 300_000, { costs: 100_000 });
  const client = await (await request('/client')).json();
  assert.equal(client.statementPeriods[0].opening, 1_200_000);
  assert.equal(client.statementPeriods[0].payable, 1_400_000);
  const reminders = await (await request('/reminders')).json();
  assert.equal(reminders[0].carryForward, 1_400_000);
  assert.equal(reminders[0].paidAmount, 0);
  const exported = await (await request('/export?id=q2')).json();
  assert.equal(exported.statement.openingBalance, 1_200_000);
  assert.equal(exported.settlement.carryForward, 1_400_000);
});

void test('monthly periods normalize chronologically while retaining genuinely earlier source quarters', () => {
  for (const value of [
    '2026-07',
    '07/2026',
    '202607',
    '072026',
    '2026-07-31',
    'July 2026',
  ])
    assert.equal(normalizeSalesMonth(value), '2026-07');
  const serial = (Date.UTC(2026, 6, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;
  assert.equal(normalizeSalesMonth(serial), '2026-07');
  assert.equal(normalizeSalesMonth('2026-02-30'), null);
  const series = aggregateSalesPeriods(
    ['2026-09', '2026-Q2', '2026-07', '08/2026'].map((salesPeriod) => ({
      salesPeriod,
      netPayable: 100,
      sales: 1,
    })),
  );
  assert.deepEqual(
    series.map((row) => row.key),
    ['2026-Q2', '2026-07', '2026-08', '2026-09'],
  );
  assert.equal(
    series.reduce((sum, row) => sum + row.value, 0),
    400,
  );
  const quarter = aggregateSalesPeriods([
    {
      salesPeriod: '2026-Q3',
      startDate: '2026-07-01',
      periodEndDate: '2026-09-30',
      netPayable: 100,
      sales: 1,
    },
  ]);
  assert.equal(quarter[0].key, '2026-Q3');
});

void test('uploaded preassigned rule applies Gross Income before GM and uses prior unpaid balance', async () => {
  const ruleFile = workbook();
  const { preview } = await (await importRequest(ruleFile)).json();
  assert.equal(
    (await importRequest(ruleFile, 'commit', preview.previewToken)).status,
    200,
  );
  await statement('q2', '2026-Q2', 1_200_000);
  await db
    .prepare(`INSERT INTO track_guarantees (id,client_id,track_title,track_key,track_external_id,initial_amount,balance_amount,status,created_by_user_id,created_at,updated_at)
    VALUES ('gm','a','Song A','song a','VNABC2600001',100000,100000,'active','admin','2026-01-01','2026-01-01')`)
    .run();
  const file = workbook(
    [['A001', 'VNABC2600001', 'Song A', 1000000, 500000, 'VND', '2026-07']],
    [
      'Account No.',
      'ISRC',
      'Track Title',
      'Gross Income',
      'Net Payable',
      'Currency',
      'Sales Period',
    ],
  );
  async function upload(action, previewToken = '', period = '2026-Q3') {
    const body = new FormData();
    body.set('file', new Blob([file]), 'statement.xlsx');
    body.set('uploadMode', 'bulk');
    body.set('period', period);
    body.set('action', action);
    body.set('previewToken', previewToken);
    return request('/uploads', { method: 'POST', body });
  }
  const checked = await upload('preview');
  assert.equal(checked.status, 200, await checked.clone().text());
  const next = await checked.json();
  assert.equal(next.preview.totals.nextRevenue, 800000);
  assert.equal(next.preview.totals.guaranteeRecouped, 100000);
  assert.equal(next.preview.totals.nextPayable, 1900000);
  const committed = await upload('commit', next.previewToken);
  assert.equal(committed.status, 200, await committed.text());
  const client = await (await request('/client')).json();
  const period = client.statementPeriods[0];
  assert.equal(period.revenue, 800000);
  assert.equal(period.costs, 100000);
  assert.equal(period.carryForward, 1900000);
  assert.equal(period.paid, 0);
  assert.equal((await action(period.id, 'mark_paid')).status, 200);
  const blocked = await upload('preview', '', '2026-Q1');
  assert.equal(blocked.status, 409, await blocked.text());
});

void test('XLSX styles support numeric percentages and prefixed OOXML without changing revenue parsing', () => {
  const files = unzipSync(
    workbook([[...ruleRow.slice(0, 3), 0.8, ...ruleRow.slice(4)]]),
  );
  files['xl/styles.xml'] = strToU8(
    strFromU8(files['xl/styles.xml']).replace(
      'numFmtId="166" formatCode="0.00"',
      'numFmtId="166" formatCode="0.00%"',
    ),
  );
  let sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  sheet = sheet
    .replace(
      /<(\/?)(worksheet|sheetViews|sheetView|pane|cols|col|sheetData|row|c|is|t|v|autoFilter)(\s|>)/g,
      '<$1x:$2$3',
    )
    .replace(
      '<x:worksheet ',
      '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
    );
  files['xl/worksheets/sheet1.xml'] = strToU8(sheet);
  const parsed = parseRoyaltyRuleImport(buffer(zipSync(files)));
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows[0].royaltyRateBps, 8000);
  const revenue = parseRoyaltyWorkbook(
    buffer(
      workbook(
        [['A001', 'Song A', 500, 700, 'VND']],
        [
          'Account No.',
          'Track Title',
          'Net Payable',
          'Gross Income',
          'Currency',
        ],
      ),
    ),
    { groupByClientCode: true },
  );
  assert.equal(revenue.rowCount, 1);
});

void test('rules template is empty, admin-only; client and unsigned uploads are rejected', async () => {
  assert.equal((await request('/rules', {}, '')).status, 401);
  assert.equal(
    (await importRequest(workbook(), 'preview', '', 'viewer@test.invalid'))
      .status,
    403,
  );
  const response = await request('/rules');
  assert.equal(response.status, 200);
  const empty = parseRoyaltyRuleImport(await response.arrayBuffer());
  assert.equal(empty.rows.length, 0);
  assert.match(empty.issues[0].message, /chưa có dòng/);
  assert.equal((await importRequest(workbook(), 'commit', '')).status, 409);
});

void test('preview/commit creates, updates and idempotently retains customer-ISRC rates', async () => {
  const file = workbook();
  const previewResponse = await importRequest(file);
  assert.equal(previewResponse.status, 200);
  const { preview } = await previewResponse.json();
  assert.equal(preview.canCommit, true, JSON.stringify(preview.issues));
  assert.equal(preview.summary.create, 1);
  const committed = await importRequest(file, 'commit', preview.previewToken);
  assert.equal(committed.status, 200, await committed.text());
  const unchanged = await (await importRequest(file)).json();
  assert.equal(unchanged.preview.summary.unchanged, 1);
  const updatedFile = workbook([
    [...ruleRow.slice(0, 3), '70%', ...ruleRow.slice(4)],
  ]);
  const updated = await (await importRequest(updatedFile)).json();
  assert.equal(updated.preview.summary.update, 1);
  assert.equal(
    (await importRequest(updatedFile, 'commit', updated.preview.previewToken))
      .status,
    200,
  );
  const rules = await db.prepare('SELECT * FROM track_royalty_rules').all();
  assert.equal(rules.results.length, 1);
  assert.equal(rules.results[0].royalty_rate_bps, 7000);
  assert.equal(
    (await importRequest(file, 'commit', preview.previewToken)).status,
    409,
  );
});

void test('invalid and overlapping rows reject the whole import without mutations', async () => {
  for (const rows of [
    [ruleRow, ['MISSING', 'VNABC2600002', 'B', '80%', '2026-Q3', '']],
    [ruleRow, [...ruleRow]],
    [[...ruleRow.slice(0, 3), '101%', ...ruleRow.slice(4)]],
    [[...ruleRow.slice(0, 3), '80.001%', ...ruleRow.slice(4)]],
  ]) {
    const file = workbook(rows);
    const { preview } = await (await importRequest(file)).json();
    assert.equal(preview.canCommit, false);
    assert.equal(
      (await importRequest(file, 'commit', 'irrelevant')).status,
      422,
    );
  }
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM track_royalty_rules').first())
      .n,
    0,
  );
  await db.prepare("UPDATE clients SET status='archived' WHERE id='a'").run();
  assert.equal(
    (await (await importRequest(workbook())).json()).preview.canCommit,
    false,
  );
});

void test('transaction checks the preview snapshot again to stop concurrent overwrites', async () => {
  const file = buffer(workbook());
  const first = await previewRoyaltyRuleImport(db, file, 'admin@test.invalid');
  const competing = await previewRoyaltyRuleImport(
    db,
    file,
    'admin@test.invalid',
  );
  await commitRoyaltyRuleImport(db, first, 'admin');
  await assert.rejects(
    () => commitRoyaltyRuleImport(db, competing, 'admin'),
    /Dữ liệu đã thay đổi/,
  );
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM track_royalty_rules').first())
      .n,
    1,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_logs WHERE action='track_royalty_rules_imported'",
        )
        .first()
    ).n,
    1,
  );
});

void test('monthly SQL aggregate includes more than 5000 rows and isolates customers', async () => {
  await statement('q3', '2026-Q3', 5100);
  await db
    .prepare(`INSERT INTO statement_line_items (id,client_id,report_period_id,source_upload_id,row_index,account_no,sales_period,sales,net_payable,currency,created_at)
    WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5100)
    SELECT 'line-'||x,'a','q3','u-q3',x,'A001',CASE WHEN x<=5000 THEN '2026-07' ELSE '2026-08' END,1,1,'VND','2026-01-01' FROM n`)
    .run();
  const client = await (await request('/client')).json();
  assert.equal(client.lineItemsByPeriod['2026-Q3'].length, 5000);
  assert.equal(
    client.salesPeriodsByPeriod['2026-Q3'].reduce(
      (sum, row) => sum + row.netPayable,
      0,
    ),
    5100,
  );
  assert.equal(client.salesPeriodsByPeriod['2026-Q3'].length, 2);
});
