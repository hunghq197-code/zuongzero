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
    'app/api/admin/statements/route.ts',
    'app/api/admin/uploads/route.ts',
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
  assert.match(statementsRoute, /authorization\.role !== 'super_admin'/);
  assert.match(statementsRoute, /buildReverseGuaranteeRecoupmentStatements/);
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

  assert.match(uploadsRoute, /MAX_UPLOAD_BYTES = 15 \* 1024 \* 1024/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xlsx'\)/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xlsm'\)/);
  assert.match(uploadsRoute, /filename\.endsWith\('\.xls'\)/);
  assert.match(uploadsRoute, /REPORT_PERIOD_PATTERN/);
  assert.match(uploadsRoute, /YYYY-Q1 đến YYYY-Q4/);
  assert.match(uploadsRoute, /uploadMode === 'bulk'/);
  assert.match(uploadsRoute, /Không tìm thấy mã khách hàng trong file tổng/);
});

test('client and admin dashboard regressions keep empty states and aggregate views', () => {
  const clientData = readSource('lib/client-dashboard-data.ts');
  const clientDashboard = readSource('components/royalty-dashboard.tsx');
  const adminDashboard = readSource('lib/admin-dashboard.ts');
  const adminConsole = readSource('components/admin-console.tsx');

  assert.match(clientData, /statementPeriods: \[\]/);
  assert.match(clientData, /trend: \[\]/);
  assert.match(clientDashboard, /createEmptyCurrencyBreakdowns/);
  assert.match(clientDashboard, /Chưa có statement/);
  assert.match(adminDashboard, /trendingTracks/);
  assert.match(adminDashboard, /trendingArtists/);
  assert.match(adminConsole, /Admin dashboard tổng/);
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
