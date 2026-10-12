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
    contents: `export * from './lib/statement-balances'; export * from './lib/sales-periods'; export * from './lib/royalty-rule-import'; export * from './lib/statement-export-files'; export * from './lib/xlsx-royalty-parser'; export * from './lib/client-write-lock'; export * from './lib/app-auth';`,
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
  withClientWriteLock,
  ClientWriteError,
  createPasswordHash,
  verifyPassword,
  hashSessionToken,
  SESSION_COOKIE_NAME,
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
    'client_write_locks',
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

void test('all client insights aggregate full rows across quarters without exposing other customers', async () => {
  await statement('q3', '2026-Q3', 5100);
  await db
    .prepare(`INSERT INTO statement_line_items (id,client_id,report_period_id,source_upload_id,row_index,account_no,sales_period,sales,net_payable,currency,created_at)
    WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5100)
    SELECT 'line-'||x,'a','q3','u-q3',x,'A001',CASE WHEN x<=5000 THEN '2026-07' ELSE '2026-08' END,1,1,'VND','2026-01-01' FROM n`)
    .run();
  await db
    .prepare(
      "UPDATE statement_line_items SET configuration='Streaming', content_type='Audio', contract_name='Contract A', release_artist='Artist A', isrc='VNABC2600001', track_title='Song A' WHERE client_id='a'",
    )
    .run();
  await statement('q2', '2026-Q2', 7);
  await statement('b3', '2026-Q3', 999, { client: 'b' });
  await db
    .prepare(`INSERT INTO statement_line_items (id,client_id,report_period_id,source_upload_id,row_index,account_no,configuration,release_artist,isrc,track_title,net_payable,sales,currency,created_at)
    VALUES ('old-row','a','q2','u-q2',1,'A001','Streaming','Artist A','VNABC2600001','Song A',7,1,'VND','2026-01-01'),
      ('other-row','b','b3','u-b3',1,'B001','Other','Other artist','VNABC2600002','Other song',999,1,'VND','2026-01-01')`)
    .run();
  await db
    .prepare(`INSERT INTO revenue_breakdowns (id,client_id,report_period_id,dimension,label,value,percentage,units,row_count,created_at)
    WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2101)
    SELECT 'break-'||x,'a','q3','source','Platform '||x,1,0,1,1,'2026-01-01' FROM n`)
    .run();
  const client = await (await request('/client')).json();
  assert.deepEqual(client.lineItemsByPeriod, {});
  assert.equal(client.breakdownsByPeriod['2026-Q3'].VND.sources.length, 2101);
  const insights = client.sourceInsightsByPeriod['2026-Q3'];
  for (const dimension of [
    'configurations',
    'contentTypes',
    'contracts',
    'releaseArtists',
  ]) {
    assert.equal(insights[dimension][0].value, 5100);
    assert.equal(insights[dimension][0].rows, 5100);
    assert.equal(insights[dimension][0].percentage, 100);
  }
  assert.equal(insights.trackIdentities.length, 1);
  assert.equal(insights.trackIdentities[0].netPayable, 5100);
  assert.equal(
    client.sourceInsightsByPeriod['2026-Q2'].trackIdentities[0].netPayable,
    7,
  );
  assert.doesNotMatch(JSON.stringify(client), /Other artist|Other song/);
  assert.equal(
    client.salesPeriodsByPeriod['2026-Q3'].reduce(
      (sum, row) => sum + row.netPayable,
      0,
    ),
    5100,
  );
  assert.equal(client.salesPeriodsByPeriod['2026-Q3'].length, 2);
});

async function uploadFile(
  bytes,
  {
    action = 'preview',
    previewToken = '',
    period = '2026-Q3',
    strategy = 'create',
    clientId = 'a',
  } = {},
) {
  const body = new FormData();
  body.set('file', new Blob([bytes]), 'statement.xlsx');
  body.set('uploadMode', 'single');
  body.set('clientId', clientId);
  body.set('period', period);
  body.set('action', action);
  body.set('importStrategy', strategy);
  body.set('confirmReplace', 'true');
  body.set('previewToken', previewToken);
  return request('/uploads', { method: 'POST', body });
}

function revenueFile(count = 2) {
  return workbook(
    Array.from({ length: count }, (_, index) => [
      'A001',
      'VNABC2600001',
      'Song A',
      1000,
      800,
      'VND',
      index % 2 ? '2026-08' : '2026-07',
      1,
    ]),
    [
      'Account No.',
      'ISRC',
      'Track Title',
      'Gross Income',
      'Net Payable',
      'Currency',
      'Sales Period',
      'Sales',
    ],
  );
}

void test('a customer lease blocks payment, upload, rollback, GM and customer edits but not another customer', async () => {
  await statement('q3', '2026-Q3', 1_200_000);
  await statement('b3', '2026-Q3', 1_300_000, { client: 'b' });
  await withClientWriteLock(db, ['a'], async () => {
    assert.equal((await action('q3', 'mark_paid')).status, 409);
    assert.equal(
      (
        await request('/statements', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportPeriodId: 'q3' }),
        })
      ).status,
      409,
    );
    assert.equal((await uploadFile(revenueFile())).status, 409);
    for (const [path, body] of [
      ['/rollback', { reportPeriodId: 'q3', uploadId: 'u-q3' }],
      ['/guarantees', { clientId: 'a', trackTitle: 'Song A', amount: 100000 }],
      ['/customers', { clientId: 'a', name: 'Changed' }],
    ]) {
      const response = await request(path, {
        method: path === '/customers' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 409, await response.text());
    }
    assert.equal((await action('b3', 'mark_paid')).status, 200);
    await assert.rejects(
      withClientWriteLock(db, ['b', 'a'], async () => {}),
      ClientWriteError,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) AS total FROM client_write_locks WHERE client_id='b'",
          )
          .first()
      ).total,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) AS total FROM client_write_locks WHERE client_id='a'",
          )
          .first()
      ).total,
      1,
    );
  });
  assert.equal(
    (
      await db
        .prepare('SELECT count(*) AS total FROM client_write_locks')
        .first()
    ).total,
    0,
  );
  assert.equal((await action('q3', 'mark_paid')).status, 200);
});

void test('expired leases recover; a stale owner cannot write or release a replacement lease', async () => {
  await db
    .prepare("INSERT INTO client_write_locks VALUES ('a','expired',0)")
    .run();
  await withClientWriteLock(db, ['a'], async (scoped) => {
    await db
      .prepare(
        "UPDATE client_write_locks SET owner_token='replacement', expires_at=? WHERE client_id='a'",
      )
      .bind(Date.now() + 120000)
      .run();
    await assert.rejects(
      scoped.batch([
        scoped.prepare("UPDATE clients SET display_name='Stale' WHERE id='a'"),
      ]),
      ClientWriteError,
    );
  });
  assert.equal(
    (
      await db
        .prepare(
          "SELECT owner_token FROM client_write_locks WHERE client_id='a'",
        )
        .first()
    ).owner_token,
    'replacement',
  );
  assert.equal(
    (await db.prepare("SELECT display_name FROM clients WHERE id='a'").first())
      .display_name,
    'Artist A',
  );
});

void test('concurrent payment requests produce one payment event and preserve the first snapshot', async () => {
  await statement('q3', '2026-Q3', 1_200_000);
  const results = await Promise.all(
    Array.from({ length: 8 }, () => action('q3', 'mark_paid')),
  );
  assert.ok(results.some((response) => response.status === 200));
  assert.ok(results.every((response) => [200, 409].includes(response.status)));
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS total FROM audit_logs WHERE action='admin_statement_mark_paid'",
        )
        .first()
    ).total,
    1,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT payment_status FROM report_periods WHERE id='q3'")
        .first()
    ).payment_status,
    'paid',
  );
});

void test('a failed large import rolls back every D1 mutation and a successful import keeps all rows', async () => {
  const file = revenueFile(5101);
  const checked = await uploadFile(file);
  assert.equal(checked.status, 200, await checked.clone().text());
  const { previewToken } = await checked.json();
  await db
    .prepare(
      "CREATE TRIGGER fail_import BEFORE INSERT ON statement_line_items WHEN NEW.sales_period='2026-08' BEGIN SELECT RAISE(ABORT,'test import failure'); END",
    )
    .run();
  try {
    const failed = await uploadFile(file, { action: 'commit', previewToken });
    assert.equal(failed.status, 500);
    for (const table of [
      'statements',
      'statement_line_items',
      'revenue_breakdowns',
      'uploads',
      'report_periods',
    ]) {
      assert.equal(
        (await db.prepare(`SELECT count(*) AS total FROM ${table}`).first())
          .total,
        0,
        table,
      );
    }
  } finally {
    await db.prepare('DROP TRIGGER fail_import').run();
  }
  assert.equal(
    (
      await db
        .prepare('SELECT count(*) AS total FROM client_write_locks')
        .first()
    ).total,
    0,
  );
  const committed = await uploadFile(file, { action: 'commit', previewToken });
  assert.equal(committed.status, 200, await committed.clone().text());
  assert.equal(
    (
      await db
        .prepare('SELECT count(*) AS total FROM statement_line_items')
        .first()
    ).total,
    5101,
  );
  const active = await db
    .prepare(
      'SELECT source_upload_id AS uploadId, report_period_id AS reportPeriodId FROM statements',
    )
    .first();
  await db
    .prepare(
      "CREATE TRIGGER fail_rollback BEFORE UPDATE ON uploads WHEN NEW.status='rolled_back' BEGIN SELECT RAISE(ABORT,'test rollback failure'); END",
    )
    .run();
  try {
    const failed = await request('/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(active),
    });
    assert.equal(failed.status, 500);
    assert.equal(
      (
        await db
          .prepare('SELECT count(*) AS total FROM statement_line_items')
          .first()
      ).total,
      5101,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT status FROM uploads WHERE id=?')
          .bind(active.uploadId)
          .first()
      ).status,
      'imported',
    );
  } finally {
    await db.prepare('DROP TRIGGER fail_rollback').run();
  }
  const restored = await request('/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(active),
  });
  assert.equal(restored.status, 200, await restored.clone().text());
  assert.equal(
    (await db.prepare('SELECT count(*) AS total FROM statements').first())
      .total,
    0,
  );
});

void test('backdated GM edits are blocked even when the later quarter is unpaid and unlocked', async () => {
  await statement('q3', '2026-Q3', 1_200_000);
  await db
    .prepare(`INSERT INTO track_guarantees (id,client_id,track_title,track_key,initial_amount,balance_amount,status,created_by_user_id,created_at,updated_at)
    VALUES ('gm','a','Song A','songa',100000,100000,'active','admin','2026-01-01','2026-01-01')`)
    .run();
  const blocked = await uploadFile(revenueFile(), { period: '2026-Q2' });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).message, /GM/);
  await statement('q2', '2026-Q2', 800000);
  const deleted = await request('/statements', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportPeriodId: 'q2' }),
  });
  assert.equal(deleted.status, 409);
  assert.equal(
    (
      await db
        .prepare("SELECT balance_amount FROM track_guarantees WHERE id='gm'")
        .first()
    ).balance_amount,
    100000,
  );
});

void test('missing lock migration refuses mutations without changing data', async () => {
  await statement('q3', '2026-Q3', 1_200_000);
  await db.prepare('DROP TABLE client_write_locks').run();
  try {
    const denied = await action('q3', 'mark_paid');
    assert.equal(denied.status, 503);
    assert.equal(
      (
        await db
          .prepare("SELECT payment_status FROM report_periods WHERE id='q3'")
          .first()
      ).payment_status,
      'unpaid',
    );
  } finally {
    await db
      .prepare(
        await readFile(
          join(root, 'drizzle/0014_client_write_locks.sql'),
          'utf8',
        ),
      )
      .run();
  }
});

void test('super admin changes a personal password in the existing form without modifying other credentials', async () => {
  const current = 'demo-current-admin-password';
  const personal = 'demo-next-admin-password';
  await db
    .prepare(
      "INSERT INTO password_credentials (id,user_id,password_hash,password_updated_at,must_change_password,created_at) VALUES ('admin-pwd','admin',?,'2026-01-01',0,'2026-01-01')",
    )
    .bind(await createPasswordHash(current))
    .run();
  const token = 'keep-demo-session';
  await db
    .prepare(
      "INSERT INTO auth_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at) VALUES ('keep','admin',?,'2026-01-01','2026-01-01','2099-01-01'), ('drop','admin','old-demo-hash','2026-01-01','2026-01-01','2099-01-01')",
    )
    .bind(await hashSessionToken(token))
    .run();
  try {
    const response = await request('/password', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: new URLSearchParams({
        current_password: current,
        new_password: personal,
        confirm_password: personal,
      }),
    });
    assert.equal(response.status, 303);
    assert.equal(
      new URL(response.headers.get('Location')).searchParams.get('password'),
      'changed',
    );
    const credential = await db
      .prepare(
        "SELECT password_hash AS hash FROM password_credentials WHERE user_id='admin'",
      )
      .first();
    assert.ok(await verifyPassword(personal, credential.hash));
    assert.equal(await verifyPassword(current, credential.hash), false);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) AS total FROM auth_sessions WHERE user_id='admin'",
          )
          .first()
      ).total,
      1,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT id FROM auth_sessions WHERE user_id='admin'")
          .first()
      ).id,
      'keep',
    );
  } finally {
    await db
      .prepare("DELETE FROM password_credentials WHERE id='admin-pwd'")
      .run();
    await db.prepare("DELETE FROM auth_sessions WHERE user_id='admin'").run();
  }
});

void test('customer deletion keeps the workbook if D1 fails and removes rules before deleting the customer', async () => {
  await db
    .prepare(
      "INSERT INTO clients (id,code,legal_name,display_name,default_currency,status,created_at,updated_at) VALUES ('delete-demo','DEL','Delete Demo','Delete Demo','VND','active','2026-01-01','2026-01-01')",
    )
    .run();
  await statement('del3', '2026-Q3', 123, { client: 'delete-demo' });
  const bucket = await mf.getR2Bucket('FILES');
  await bucket.put('files/del3', 'synthetic-workbook');
  await db
    .prepare(
      "INSERT INTO track_royalty_rules (id,client_id,track_title,track_external_id,track_external_key,royalty_rate_bps,effective_from_period,status,created_by_user_id,created_at,updated_at) VALUES ('delete-rule','delete-demo','Song','VNABC2600001','VNABC2600001',8000,'2026-Q3','active','admin','2026-01-01','2026-01-01')",
    )
    .run();
  await db
    .prepare(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON clients WHEN OLD.id='delete-demo' BEGIN SELECT RAISE(ABORT,'test deletion failure'); END",
    )
    .run();
  const options = {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'delete-demo', action: 'delete' }),
  };
  try {
    assert.equal((await request('/customers', options)).status, 500);
    assert.ok(await bucket.get('files/del3'));
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) AS total FROM statements WHERE client_id='delete-demo'",
          )
          .first()
      ).total,
      1,
    );
  } finally {
    await db.prepare('DROP TRIGGER fail_delete').run();
  }
  const deleted = await request('/customers', options);
  assert.equal(deleted.status, 200, await deleted.clone().text());
  assert.equal(await bucket.get('files/del3'), null);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS total FROM clients WHERE id='delete-demo'")
        .first()
    ).total,
    0,
  );
});
