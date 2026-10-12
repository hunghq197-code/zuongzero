import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = resolve('outputs/statement-history-2026-10-12');
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:3212/tests/browser/product-preview.html';
const errors = [];
let checks = 0;
const money = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

try {
  for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    const summary = page.getByRole('region', {
      name: 'Tổng quan tài chính',
      exact: true,
    });
    const monthly = page.getByRole('region', {
      name: 'Doanh thu theo tháng phát sinh',
    });
    const history = page
      .getByRole('heading', {
        name: 'Lịch sử báo cáo',
        exact: true,
      })
      .locator('..')
      .locator('..');
    const quarterLink = (quarter) =>
      history.getByRole('link', {
        name: `Xem báo cáo Quý ${quarter}/2026`,
        exact: true,
      });

    await page.goto(`${base}?view=financial`);
    await summary.waitFor();
    await history.screenshot({
      path: resolve(output, `${name}-history-links.png`),
    });
    let documentRequests = 0;
    page.on('request', (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        documentRequests++;
      }
    });
    await quarterLink(2).click();
    await summary.getByText('Quý 2/2026', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Quý báo cáo').innerText(),
      'Quý 2/2026',
    );
    assert.deepEqual(
      await summary.locator('dd').allTextContents(),
      [1_500_000, 0, 1_200_000, 1_200_000, 0, 1_200_000].map(money),
    );
    await monthly.getByText('Báo cáo Quý 2/2026', { exact: true }).waitFor();
    await monthly.getByText('04/2026', { exact: true }).first().waitFor();
    assert.equal(
      await monthly.getByText('07/2026', { exact: true }).count(),
      0,
    );
    assert.equal(new URL(page.url()).searchParams.get('period'), '2026-Q2');
    assert.equal(documentRequests, 0);
    assert.equal(await quarterLink(2).getAttribute('aria-current'), 'true');
    await page.waitForFunction(() => window.scrollY === 0);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'client-overview',
    );
    await page.screenshot({ path: resolve(output, `${name}-quarter-2.png`) });
    checks++;

    await quarterLink(3).focus();
    await page.keyboard.press('Enter');
    await summary.getByText('Quý 3/2026', { exact: true }).waitFor();
    assert.equal(await quarterLink(2).getAttribute('aria-current'), null);
    assert.equal(await quarterLink(3).getAttribute('aria-current'), 'true');
    await monthly.getByText('07/2026', { exact: true }).first().waitFor();
    checks++;

    await page.goBack();
    await summary.getByText('Quý 2/2026', { exact: true }).waitFor();
    await page.goForward();
    await summary.getByText('Quý 3/2026', { exact: true }).waitFor();
    await page.goBack();
    await page.reload();
    await summary.getByText('Quý 2/2026', { exact: true }).waitFor();
    checks++;

    const href = await quarterLink(2).getAttribute('href');
    const tab = await browser.newPage({ viewport });
    tab.on('pageerror', (error) => errors.push(error.message));
    await tab.goto(new URL(href, page.url()).href);
    await tab
      .getByRole('region', { name: 'Tổng quan tài chính', exact: true })
      .getByText('Quý 2/2026', { exact: true })
      .waitFor();
    await tab.close();
    checks++;

    await page.getByLabel('Quý báo cáo').click();
    await page.getByRole('option', { name: 'Quý 3/2026', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('period'), '2026-Q3');
    await summary.getByText('Quý 3/2026', { exact: true }).waitFor();
    checks++;

    const exports = [];
    await page.route('**/api/statements/**/export?format=*', (route) => {
      const url = new URL(route.request().url());
      exports.push(`${url.pathname}?${url.searchParams}`);
      const excel = url.searchParams.get('format') === 'excel';
      if (!excel) {
        return route.fulfill({
          json: {
            kind: 'pdf',
            filename: 'fixture.pdf',
            data: {
              reportPeriodId: 'finance-q2',
              clientCode: 'preview-client',
              clientName: 'Nghệ sĩ thử nghiệm',
              legalName: null,
              currency: 'VND',
              period: '2026-Q2',
              periodLabel: 'Quý 2/2026',
              publishedAt: '2026-07-01T00:00:00Z',
              breakdowns: [],
              lineItems: [],
              statement: {
                grossRevenue: 1_500_000,
                netRevenue: 1_200_000,
                netCosts: 0,
                openingBalance: 0,
                reservesReleased: 0,
                reservesWithheld: 0,
                rowCount: 0,
                units: 0,
              },
              settlement: {
                payable: 1_200_000,
                paidAmount: 0,
                paidAt: null,
                paymentStatus: 'unpaid',
                carryForward: 1_200_000,
              },
            },
          },
        });
      }
      return route.fulfill({
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: {
          'content-disposition': 'attachment; filename="fixture.xlsx"',
        },
        body: Buffer.from('synthetic export'),
      });
    });
    const olderRow = quarterLink(2).locator('..').locator('..');
    for (const format of ['PDF', 'Excel']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        olderRow.getByRole('button', { name: format, exact: true }).click(),
      ]);
      assert.equal(await download.failure(), null);
    }
    assert.deepEqual(exports, [
      '/api/statements/finance-q2/export?format=pdf',
      '/api/statements/finance-q2/export?format=excel',
    ]);
    await summary.getByText('Quý 3/2026', { exact: true }).waitFor();
    checks++;

    for (const period of ['2024-Q1', 'not-a-quarter']) {
      await page.goto(`${base}?view=financial&period=${period}`);
      await summary.getByText('Quý 3/2026', { exact: true }).waitFor();
      assert.equal(await quarterLink(2).count(), 1);
    }
    await page.goto(`${base}?view=client&period=2026-Q2`);
    await summary.waitFor();
    assert.deepEqual(
      await summary.locator('dd').allTextContents(),
      Array(6).fill(money(0)),
    );
    assert.equal(
      await history.getByRole('link', { name: /Xem báo cáo/ }).count(),
      0,
    );
    checks++;

    await page.goto(`${base}?view=financial&history=many`);
    await history.getByLabel('Trang sau', { exact: true }).click();
    await history
      .getByRole('link', { name: 'Xem báo cáo Quý 2/2023', exact: true })
      .click();
    await summary.getByText('Quý 2/2023', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('period'), '2023-Q2');
    await page.screenshot({ path: resolve(output, `${name}-older-page.png`) });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    checks++;
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${checks}/${checks}: history links, values/charts, focus, keyboard, browser history/reload/new tab, exports, valid scope and pagination. Synthetic local data only.`,
  );
} finally {
  await browser.close();
}
