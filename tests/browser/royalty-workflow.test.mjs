import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = resolve('outputs/royalty-workflow-2026-10-05');
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:3212/tests/browser/product-preview.html';
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}?view=financial`);
  // The labels and source months must change together with the selected statement.
  await page.getByText('Số dư kỳ trước chuyển sang', { exact: true }).waitFor();
  assert.equal(
    await page.getByText('Tổng giảm trừ', { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText('Chỉ số tài chính bổ sung', { exact: true }).count(),
    0,
  );
  const opening = page
    .getByText('Số dư kỳ trước chuyển sang', { exact: true })
    .locator('..');
  assert.match(await opening.textContent(), /1\.200\.000/);
  const net = page
    .getByText('Thực nhận trong quý', { exact: true })
    .locator('..');
  assert.match(await net.textContent(), /700\.000/);
  const total = page
    .getByText('Tổng số dư đến kỳ này', { exact: true })
    .locator('..');
  assert.match(await total.textContent(), /1\.900\.000/);
  const monthly = page.getByRole('region', {
    name: 'Doanh thu theo tháng phát sinh',
  });
  await monthly.getByText('Báo cáo Quý 3/2026', { exact: true }).waitFor();
  for (const month of ['07/2026', '08/2026', '09/2026'])
    await monthly.getByText(month, { exact: true }).first().waitFor();
  assert.equal(await monthly.getByText('04/2026', { exact: true }).count(), 0);
  await page.screenshot({
    path: resolve(output, 'client-desktop.png'),
    fullPage: true,
  });
  await page.getByLabel('Quý báo cáo', { exact: true }).click();
  await page.getByRole('option', { name: 'Quý 2/2026', exact: true }).click();
  await monthly.getByText('Báo cáo Quý 2/2026', { exact: true }).waitFor();
  await monthly.getByText('04/2026', { exact: true }).first().waitFor();
  assert.equal(await monthly.getByText('07/2026', { exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(output, 'client-mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );

  let invalid = true,
    committed = false,
    commitCount = 0;
  const preview = {
    canCommit: true,
    previewToken: 'fixture-token',
    issues: [],
    summary: { create: 1, update: 0, unchanged: 0, total: 1 },
    rows: [
      {
        sheet: 'Sheet1',
        row: 2,
        customerAccountNo: 'A001',
        isrc: 'VNABC2600001',
        trackTitle: 'Bài hát thử nghiệm',
        royaltyRateBps: 8000,
        effectiveFromPeriod: '2026-Q3',
        effectiveToPeriod: null,
        action: 'create',
        clientId: 'a',
        clientName: 'Nghệ sĩ thử nghiệm',
        ruleId: null,
        previous: null,
      },
    ],
  };
  await page.route('**/api/admin/royalty-rules**', async (route) => {
    const request = route.request();
    if (!request.url().endsWith('/import'))
      return route.fulfill({
        json: {
          rules: committed
            ? [
                {
                  id: 'new-rule',
                  clientId: 'a',
                  clientCode: 'A001',
                  clientName: 'Nghệ sĩ thử nghiệm',
                  trackTitle: 'Bài hát thử nghiệm',
                  trackExternalId: 'VNABC2600001',
                  royaltyRateBps: 8000,
                  effectiveFromPeriod: '2026-Q3',
                  effectiveToPeriod: null,
                  status: 'active',
                  notes: null,
                  updatedAt: '2026-10-05',
                },
              ]
            : [],
        },
      });
    if (request.postData()?.includes('name="action"\r\n\r\ncommit')) {
      committed = true;
      commitCount++;
      return route.fulfill({
        json: { message: 'Đã lưu danh sách bài hát và tỷ lệ chia.' },
      });
    }
    return route.fulfill({
      json: {
        preview: invalid
          ? {
              ...preview,
              canCommit: false,
              previewToken: null,
              issues: [
                {
                  sheet: 'Sheet1',
                  row: 2,
                  message: 'Mã khách hàng không tồn tại.',
                },
              ],
            }
          : preview,
      },
    });
  });
  await page.goto(`${base}?view=rules`);
  await page.getByLabel('Danh sách bài hát và tỷ lệ (.xlsx)').setInputFiles({
    name: 'rules.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('mock'),
  });
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Xác nhận lưu tỷ lệ', exact: true })
      .isDisabled(),
    true,
  );
  invalid = false;
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await page
    .getByRole('button', { name: 'Xác nhận lưu tỷ lệ', exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(output, 'rule-preview-mobile.png'),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve(output, 'rule-preview-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Xác nhận lưu tỷ lệ', exact: true })
    .click();
  await page
    .getByText('Đã lưu danh sách bài hát và tỷ lệ chia.', { exact: true })
    .waitFor();
  await page.getByRole('cell', { name: '80%', exact: true }).waitFor();
  assert.equal(commitCount, 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: quarter switching, unpaid balances, hidden finance fields, rule preview/validation/commit, desktop/mobile',
  );
} finally {
  await browser.close();
}
