import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function readSource(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('all admin API routes require signed-in admin authorization', () => {
  const adminRoutes = [
    'app/api/admin/access-requests/route.ts',
    'app/api/admin/access-requests/[requestId]/route.ts',
    'app/api/admin/accounts/route.ts',
    'app/api/admin/activity/route.ts',
    'app/api/admin/customers/route.ts',
    'app/api/admin/email/route.ts',
    'app/api/admin/guarantees/route.ts',
    'app/api/admin/overview/route.ts',
    'app/api/admin/reminders/route.ts',
    'app/api/admin/royalty-rules/route.ts',
    'app/api/admin/statements/route.ts',
    'app/api/admin/statements/[reportPeriodId]/export/route.ts',
    'app/api/admin/uploads/route.ts',
    'app/api/admin/uploads/history/route.ts',
    'app/api/admin/uploads/rollback/route.ts',
  ];

  for (const route of adminRoutes) {
    const source = readSource(route);

    assert.match(source, /getChatGPTUser/, `${route} must read the session`);
    assert.match(source, /getAdminAccess/, `${route} must check admin access`);
    assert.match(source, /401/, `${route} must expose an unauthorized branch`);
  }
});

test('super-admin-only destructive routes stay explicitly guarded', () => {
  const customersRoute = readSource('app/api/admin/customers/route.ts');
  const statementsRoute = readSource('app/api/admin/statements/route.ts');
  const accountsRoute = readSource('app/api/admin/accounts/route.ts');

  assert.match(customersRoute, /authorization\.role !== 'super_admin'/);
  assert.match(customersRoute, /DELETE FROM clients/);
  assert.match(customersRoute, /DELETE FROM statement_line_items/);
  assert.match(statementsRoute, /authorization\.role !== 'super_admin'/);
  assert.match(statementsRoute, /buildReverseGuaranteeRecoupmentStatements/);
  assert.match(statementsRoute, /DELETE FROM statement_line_items/);
  assert.match(accountsRoute, /access\.role !== 'super_admin'/);
  assert.match(accountsRoute, /managed_account_created/);
});

test('client account creation creates a new customer instead of choosing one', () => {
  const accountsRoute = readSource('app/api/admin/accounts/route.ts');

  assert.match(accountsRoute, /clientCode\?: unknown/);
  assert.match(accountsRoute, /clientName\?: unknown/);
  assert.match(accountsRoute, /INSERT INTO clients/);
  assert.match(accountsRoute, /clientIdForCode\(clientCode\)/);
  assert.doesNotMatch(accountsRoute, /clientId\?: unknown/);
});

test('upload contracts enforce quarterly xlsx import and bulk client matching', () => {
  const uploadsRoute = readSource('app/api/admin/uploads/route.ts');
  const parser = readSource('lib/xlsx-royalty-parser.ts');
  const schema = readSource('db/schema.ts');
  const lineItems = readSource('lib/statement-line-items.ts');

  assert.match(uploadsRoute, /MAX_UPLOAD_BYTES = 15 \* 1024 \* 1024/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xlsx'\)/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xlsm'\)/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xls'\)/);
  assert.match(uploadsRoute, /REPORT_PERIOD_PATTERN/);
  assert.match(uploadsRoute, /YYYY-Q1 đến YYYY-Q4/);
  assert.match(uploadsRoute, /uploadMode === 'bulk'/);
  assert.match(
    uploadsRoute,
    /type ImportStrategy = 'create' \| 'replace' \| 'sync'/,
  );
  assert.match(uploadsRoute, /mergeStatementLineItems/);
  assert.match(uploadsRoute, /statementExists/);
  assert.match(uploadsRoute, /existing\?\.status === 'locked'/);
  assert.match(uploadsRoute, /existing\?\.paymentStatus === 'paid'/);
  assert.match(uploadsRoute, /uploadAction === 'preview'/);
  assert.match(uploadsRoute, /previewToken/);
  assert.match(uploadsRoute, /captureStatementImportSnapshot/);
  assert.match(uploadsRoute, /replaced_upload_id/);
  assert.match(uploadsRoute, /Không tìm thấy mã khách hàng trong file tổng/);
  assert.match(uploadsRoute, /statement_line_items/);
  assert.match(schema, /statement_line_items/);
  assert.match(lineItems, /Contract Name/);
  assert.match(lineItems, /Gross Income/);
  assert.match(lineItems, /Royalty Rate/);
  assert.match(lineItems, /statementLineItemMergeKey/);
  assert.match(lineItems, /mergeStatementLineItems/);
  assert.match(parser, /'accountno'/);
  assert.match(parser, /'isrc'/);
  assert.match(parser, /'partner'/);
  assert.match(parser, /'distributionchannel'/);
  assert.match(parser, /contentType: \['type'/);
  assert.match(parser, /distributionChannel'.*key: 'configurations'/s);
  assert.match(parser, /\?:\\\/>\|>/);
  assert.match(parser, /trackExternalId: string \| null/);
  assert.doesNotMatch(parser, /configuration:\s*\[[^\]]*'type'/s);
});

test('safe import preview and rollback remain guarded and auditable', () => {
  const uploadsRoute = readSource('app/api/admin/uploads/route.ts');
  const historyRoute = readSource('app/api/admin/uploads/history/route.ts');
  const rollbackRoute = readSource('app/api/admin/uploads/rollback/route.ts');
  const snapshots = readSource('lib/statement-import-snapshots.ts');
  const adminConsole = readSource('components/admin-console.tsx');

  assert.match(uploadsRoute, /createImportConfirmationToken/);
  assert.match(uploadsRoute, /rollbackSnapshotKey/);
  assert.match(historyRoute, /current_statement\.source_upload_id = u\.id/);
  assert.match(historyRoute, /target\.paymentStatus !== 'paid'/);
  assert.match(historyRoute, /hasNewerActiveUpload/);
  assert.match(rollbackRoute, /target\.currentUploadId !== uploadId/);
  assert.match(rollbackRoute, /target\.status === 'locked'/);
  assert.match(rollbackRoute, /target\.paymentStatus === 'paid'/);
  assert.match(rollbackRoute, /newerActiveUpload/);
  assert.match(rollbackRoute, /SET status = 'rolled_back'/);
  assert.match(rollbackRoute, /admin_statement_upload_rolled_back/);
  assert.match(snapshots, /restoreStatementImportSnapshot/);
  assert.match(snapshots, /DELETE FROM statement_line_items/);
  assert.match(snapshots, /DELETE FROM track_guarantee_recoupments/);
  assert.match(adminConsole, /Kiểm tra trước khi nhập dữ liệu/);
  assert.match(adminConsole, /Lịch sử và hoàn tác/);
  assert.match(adminConsole, /Xác nhận hoàn tác/);
});

test('client and admin dashboard regressions keep empty states and aggregate views', () => {
  const clientData = readSource('lib/client-dashboard-data.ts');
  const clientDashboard = readSource('components/royalty-dashboard.tsx');
  const adminDashboard = readSource('lib/admin-dashboard.ts');
  const adminConsole = readSource('components/admin-console.tsx');
  const musicBrand = readSource('components/music-brand.tsx');

  assert.match(clientData, /statementPeriods: \[\]/);
  assert.match(clientData, /lineItemsByPeriod: \{\}/);
  assert.match(clientData, /statement_line_items/);
  assert.match(clientData, /trend: \[\]/);
  assert.match(clientDashboard, /createEmptyCurrencyBreakdowns/);
  assert.match(clientDashboard, /Chưa có báo cáo/);
  assert.doesNotMatch(clientDashboard, /standardStatementColumns/);
  assert.doesNotMatch(clientDashboard, /Dữ liệu chuẩn theo dòng/);
  assert.match(clientDashboard, /makeSourceInsights/);
  assert.match(clientDashboard, /Tổng quan tài chính/);
  assert.match(clientDashboard, /Thực nhận trong quý/);
  assert.match(clientDashboard, /Chưa thanh toán/);
  assert.match(clientData, /s\.gross_revenue AS grossRevenue/);
  assert.match(clientData, /reservesReleased/);
  assert.match(clientData, /reservesWithheld/);
  assert.match(clientDashboard, /Doanh thu theo tháng phát sinh/);
  assert.match(clientDashboard, /Theo dõi bài hát/);
  assert.match(adminDashboard, /trendingTracks/);
  assert.match(adminDashboard, /trendingArtists/);
  assert.match(adminDashboard, /emptyAdminOverviewData/);
  assert.match(adminConsole, /Admin dashboard tổng/);
  assert.match(adminConsole, /isInitialLoading/);
  assert.match(adminConsole, /emptyAdminOverviewData\(initialPeriod\)/);
  assert.doesNotMatch(adminConsole, /fallbackCustomers/);
  assert.match(adminConsole, /ChartHoverTooltip/);
  assert.match(adminConsole, /TablePagination/);
  assert.match(clientDashboard, /ChartHoverTooltip/);
  assert.match(clientDashboard, /TablePagination/);
  assert.match(adminConsole, /activeAdminTab/);
  assert.match(adminConsole, /adminStatementExportUrl/);
  assert.match(adminConsole, /Đồng bộ bổ sung/);
  assert.match(adminConsole, /Ghi đè toàn bộ/);
  assert.match(adminConsole, /prepareStatementUpload/);
  assert.match(adminConsole, /mark_paid/);
  assert.match(adminConsole, /mark_unpaid/);
  assert.match(clientDashboard, /statementExportUrl/);
  assert.match(musicBrand, /onSelect/);
  assert.match(musicBrand, /#client-statements/);
});

test('statement exports require scoped access and write audit logs', () => {
  const exportBuilder = readSource('lib/statement-export.ts');
  const adminExportRoute = readSource(
    'app/api/admin/statements/[reportPeriodId]/export/route.ts',
  );
  const clientExportRoute = readSource(
    'app/api/statements/[reportPeriodId]/export/route.ts',
  );
  const activity = readSource('lib/admin-activity.ts');

  assert.match(exportBuilder, /buildStatementWorkbook/);
  assert.match(exportBuilder, /buildStatementPdf/);
  assert.match(exportBuilder, /auditStatementExport/);
  assert.match(exportBuilder, /statement_export_/);
  assert.match(exportBuilder, /statement_line_items/);
  assert.match(exportBuilder, /Source Rows/);
  assert.match(adminExportRoute, /getAdminAccess/);
  assert.match(adminExportRoute, /auditStatementExport/);
  assert.match(clientExportRoute, /getClientPortalAccess/);
  assert.match(clientExportRoute, /clientId: access\.clientId/);
  assert.match(clientExportRoute, /publishedOnly: true/);
  assert.match(clientExportRoute, /auditStatementExport/);
  assert.match(activity, /Tải PDF statement/);
  assert.match(activity, /Tải Excel statement/);
});

test('production email and reminder surfaces stay auditable', () => {
  const emailRoute = readSource('app/api/admin/email/route.ts');
  const remindersRoute = readSource('app/api/admin/reminders/route.ts');
  const worker = readSource('worker.ts');

  assert.match(emailRoute, /getEmailProductionStatus/);
  assert.match(emailRoute, /sendProductionTestEmail/);
  assert.match(emailRoute, /email_test_sent/);
  assert.match(remindersRoute, /hasSettlementReminderTables/);
  assert.match(remindersRoute, /runSettlementReminderJob/);
  assert.match(worker, /scheduled/);
  assert.match(worker, /runScheduledSettlementReminder/);
});

test('forgot password sends the right recovery email for activated and pending accounts', () => {
  const forgotPasswordRoute = readSource(
    'app/api/auth/forgot-password/route.ts',
  );

  assert.match(forgotPasswordRoute, /LEFT JOIN password_credentials/);
  assert.match(forgotPasswordRoute, /purpose = user\.credentialId/);
  assert.match(forgotPasswordRoute, /'password_reset'/);
  assert.match(forgotPasswordRoute, /'account_activation'/);
  assert.match(forgotPasswordRoute, /sendPasswordResetEmail/);
  assert.match(forgotPasswordRoute, /sendAccountInviteEmail/);
  assert.match(forgotPasswordRoute, /genericForgotPasswordResponse/);
});

test('track guarantees keep an external song id for tracking', () => {
  const guaranteesRoute = readSource('app/api/admin/guarantees/route.ts');
  const adminConsole = readSource('components/admin-console.tsx');
  const clientDashboard = readSource('components/royalty-dashboard.tsx');
  const guarantees = readSource('lib/guarantees.ts');
  const schema = readSource('db/schema.ts');

  assert.match(schema, /track_external_id/);
  assert.match(guarantees, /trackExternalId/);
  assert.match(guarantees, /normalizeTrackExternalId/);
  assert.match(guarantees, /byExternalId/);
  assert.match(guaranteesRoute, /trackExternalId\?: unknown/);
  assert.match(guaranteesRoute, /track_external_id/);
  assert.match(adminConsole, /ID bài hát/);
  assert.match(adminConsole, /setGuaranteeTrackExternalId/);
  assert.match(clientDashboard, /trackExternalId/);
});

test('song royalty rules only override configured ISRC rows before GM recoupment', () => {
  const route = readSource('app/api/admin/royalty-rules/route.ts');
  const rules = readSource('lib/royalty-rules.ts');
  const uploads = readSource('app/api/admin/uploads/route.ts');
  const adminConsole = readSource('components/admin-console.tsx');
  const panel = readSource('components/royalty-rules-panel.tsx');
  const migration = readSource('drizzle/0012_track_royalty_rules.sql');

  assert.match(route, /findOverlappingRule/);
  assert.match(route, /track_external_key/);
  assert.match(rules, /grossIncome \* rule\.royaltyRateBps/);
  assert.match(rules, /calculationMode: 'excel'/);
  assert.match(rules, /calculationMode: 'track_rule'/);
  assert.match(uploads, /applyRoyaltyRulesToTargets/);
  assert.ok(
    uploads.indexOf(
      'const ruleAppliedTargets = await applyRoyaltyRulesToTargets',
    ) <
      uploads.indexOf(
        'const guaranteePlan = await planTrackGuaranteeRecoupments',
      ),
  );
  assert.match(adminConsole, /value="royalty_rules"/);
  assert.match(panel, /Tỷ lệ khách hàng nhận/);
  assert.match(panel, /ISRC \/ ID bài hát/);
  assert.match(migration, /CREATE TABLE `track_royalty_rules`/);
  assert.match(migration, /`source_net_payable`/);
  assert.match(migration, /`calculation_mode`/);
});

test('login requires an email OTP before creating a session', () => {
  const loginRoute = readSource('app/api/auth/login/route.ts');
  const verifyRoute = readSource('app/api/auth/verify-login/route.ts');
  const verifyPage = readSource('app/login/verify/page.tsx');
  const schema = readSource('db/schema.ts');

  assert.match(schema, /auth_login_otps/);
  assert.match(loginRoute, /createLoginOtpChallenge/);
  assert.match(loginRoute, /sendLoginOtpEmail/);
  assert.doesNotMatch(loginRoute, /buildSessionCookie/);
  assert.doesNotMatch(loginRoute, /INSERT INTO auth_sessions/);
  assert.match(verifyRoute, /auth_login_otps/);
  assert.match(verifyRoute, /LOGIN_OTP_MAX_ATTEMPTS/);
  assert.match(verifyRoute, /buildSessionCookie/);
  assert.match(verifyRoute, /INSERT INTO auth_sessions/);
  assert.match(verifyPage, /InputOTP/);
  assert.match(verifyPage, /\/api\/auth\/verify-login/);
});
