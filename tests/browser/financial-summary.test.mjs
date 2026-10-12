import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = resolve('outputs/financial-summary-2026-10-12');
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:3212/tests/browser/product-preview.html';
const labels = [
  'Tổng doanh thu',
  'Số dư kỳ trước',
  'Thực nhận trong quý',
  'Số dư kỳ này',
  'Đã thanh toán',
  'Số dư chuyển kỳ sau',
];
const money = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
const errors = [];
let checks = 0;

try {
  for (const { name, viewport, columns } of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 }, columns: 3 },
    { name: 'tablet', viewport: { width: 768, height: 1024 }, columns: 2 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, columns: 1 },
    { name: 'small-mobile', viewport: { width: 320, height: 760 }, columns: 1 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    for (const { state, query, values } of [
      {
        state: 'unpaid',
        query: '?view=financial',
        values: [1_000_000, 1_200_000, 700_000, 1_900_000, 0, 1_900_000],
      },
      {
        state: 'paid',
        query: '?view=financial&payment=paid',
        values: [1_000_000, 1_200_000, 700_000, 1_900_000, 1_900_000, 0],
      },
      { state: 'empty', query: '?view=client', values: [0, 0, 0, 0, 0, 0] },
      {
        state: 'large',
        query: '?view=financial&amount=large',
        values: [
          9_876_543_210_123, 987_654_321_000, 8_765_432_109_999,
          9_753_086_430_999, 0, 9_753_086_430_999,
        ],
      },
    ]) {
      await page.goto(`${base}${query}`);
      const summary = page.getByRole('region', {
        name: 'Tổng quan tài chính',
        exact: true,
      });
      await summary.waitFor({ state: 'visible' });
      assert.deepEqual(await summary.locator('dt').allTextContents(), labels);
      assert.deepEqual(
        await summary.locator('dd').allTextContents(),
        values.map(money),
      );
      assert.equal(
        await summary.getByText('Cần thanh toán', { exact: true }).count(),
        0,
      );
      assert.equal(
        await summary.getByText('Chi tiết cách tính', { exact: true }).count(),
        0,
      );
      assert.equal(await summary.locator('details').count(), 0);
      assert.equal(
        await summary
          .locator('dl')
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(' ').length,
          ),
        columns,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.ok(
        await summary
          .locator('dt, dd')
          .evaluateAll((elements) =>
            elements.every(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
          ),
      );
      await summary.screenshot({
        path: resolve(output, `${name}-${state}.png`),
      });
      checks++;
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${checks}/${checks}: exactly six metrics, correct paid/unpaid/empty values, and large amounts across desktop/tablet/mobile. No production data used.`,
  );
} finally {
  await browser.close();
}
