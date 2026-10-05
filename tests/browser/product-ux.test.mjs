import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const browser = await playwright.chromium.launch({
  channel: 'chrome',
  headless: true,
});
const preview = 'http://127.0.0.1:3212/tests/browser/product-preview.html';
const screenshotDirectory = resolve('outputs/product-review-2026-10-05');
await mkdir(screenshotDirectory, { recursive: true });
const errors = [];

const customers = Array.from({ length: 35 }, (_, index) => ({
  id: `test-${index + 1}`,
  code: `KH${index + 1}`,
  name: `Khách hàng ${index + 1}`,
  viewerEmail: `customer${index + 1}@example.com`,
  latestPeriod: null,
  uploadedQuarters: 0,
  totalRevenue: 0,
  status: 'active',
}));

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const requests = [];
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    const payload = url.pathname.endsWith('/accounts')
      ? { accounts: [], customers }
      : url.pathname.endsWith('/overview')
        ? {
            overview: {
              period: url.searchParams.get('period'),
              periodLabel: 'Quý thử nghiệm',
              summary: {
                activeCustomers: 35,
                totalCustomers: 35,
                reportingCustomers: 0,
                missingCustomers: 35,
                statementCount: 0,
                revenueVnd: 0,
                trackCount: 0,
                artistCount: 0,
                units: 0,
                sourceRows: 0,
              },
              quarterlyTrend: [],
              topCustomers: [],
              trendingTracks: [],
              trendingArtists: [],
              topSources: [],
              topTerritories: [],
            },
          }
        : url.pathname.endsWith('/statements')
          ? { statements: [] }
          : url.pathname.endsWith('/activity')
            ? { activity: [] }
            : url.pathname.endsWith('/guarantees')
              ? { guarantees: [] }
              : url.pathname.endsWith('/reminders')
                ? { recipients: [], runs: [] }
                : { message: 'Dịch vụ email thử nghiệm đang tạm ngưng.' };
    await route.fulfill({
      status: url.pathname.endsWith('/email') ? 503 : 200,
      json: payload,
    });
  });
  await page.goto(preview);
  await page
    .getByRole('heading', { name: 'Tổng quan hệ thống', exact: true })
    .waitFor({ state: 'visible' });
  assert.ok(!requests.includes('/api/admin/email'));
  assert.ok(!requests.includes('/api/admin/reminders'));
  await page.screenshot({
    path: resolve(screenshotDirectory, 'admin-desktop.png'),
    fullPage: true,
  });

  await page.getByRole('tab', { name: 'Khách hàng', exact: true }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByLabel('Tìm khách hàng', { exact: true }).fill('Khách hàng');
  await page
    .getByRole('cell', { name: 'Khách hàng 1 KH1', exact: true })
    .waitFor({ state: 'visible' });
  assert.equal(
    await page
      .getByRole('cell', { name: 'Khách hàng 21 KH21', exact: true })
      .count(),
    0,
  );

  await page.getByRole('tab', { name: 'Email', exact: true }).click();
  await page
    .getByText('Dịch vụ email thử nghiệm đang tạm ngưng.', { exact: true })
    .waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Tổng quan', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Tổng quan hệ thống', exact: true })
    .waitFor({ state: 'visible' });
  assert.equal(
    await page
      .getByText('Dịch vụ email thử nghiệm đang tạm ngưng.', { exact: true })
      .isVisible(),
    false,
  );

  const reminderResponse = page.waitForResponse((response) =>
    response.url().includes('/api/admin/reminders'),
  );
  await page.getByRole('tab', { name: 'Nhắc lịch', exact: true }).click();
  await reminderResponse;
  assert.ok(requests.includes('/api/admin/reminders'));

  await page.goto(`${preview}?view=pagination`);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: '3', exact: true }).click();
    assert.equal(await page.getByTestId('page').textContent(), '3');
    await page.getByRole('button', { name: 'Đổi bộ lọc' }).click();
    assert.equal(await page.getByTestId('page').textContent(), '1');
  }

  await page.goto(`${preview}?view=tracks`);
  const tracking = page
    .getByRole('heading', { name: 'Theo dõi bài hát', exact: true })
    .locator('xpath=../..');
  await tracking.getByText('35 bài hát', { exact: true }).waitFor();
  await tracking.getByRole('button', { name: '4', exact: true }).click();
  await tracking
    .getByRole('cell', { name: 'Bài hát 35', exact: true })
    .waitFor();
  assert.equal(await tracking.locator('tbody tr').count(), 5);

  await page.goto(`${preview}?view=client`);
  await page.getByRole('heading', { name: 'Tổng quan tài chính' }).waitFor();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'client-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(screenshotDirectory, 'client-mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.goto(preview);
  await page
    .getByRole('heading', { name: 'Tổng quan hệ thống', exact: true })
    .waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Báo cáo', exact: true }).click();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'admin-mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: deferred tabs, isolated email failure, filter pagination, desktop/mobile dashboards',
  );
} finally {
  await browser.close();
}
