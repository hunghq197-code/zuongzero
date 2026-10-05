import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = new URL(process.env.AUTH_DEMO_URL ?? 'http://127.0.0.1:3213');
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
  'Local demo only',
);
const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const browser = await playwright.chromium.launch({
  channel: 'chrome',
  headless: true,
});
const directory = resolve('outputs/auth-demo-2026-10-05');
await mkdir(directory, { recursive: true });
const errors = [];
let checks = 0;

try {
  for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [screen, path, text] of [
      [
        'login',
        '/login?error=rate_limited&retry_after=60',
        'Thao tác quá thường xuyên. Vui lòng thử lại sau 1 phút.',
      ],
      [
        'verify',
        '/login/verify?error=rate_limited&retry_after=30',
        'Thao tác quá thường xuyên. Vui lòng thử lại sau 30 giây.',
      ],
      [
        'unavailable',
        '/login?error=temporary',
        'Dịch vụ đăng nhập tạm thời chưa sẵn sàng. Vui lòng thử lại sau ít phút.',
      ],
    ]) {
      const response = await page.goto(new URL(path, base).href);
      assert.equal(response.status(), 200);
      await page.getByText(text, { exact: true }).waitFor({ state: 'visible' });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: resolve(directory, `${screen}-${name}.png`),
        fullPage: true,
      });
      checks++;
    }
    await page.close();
  }

  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `throttle-${Date.now()}@auth-ui-demo.test`;
  const password = 'demo-invalid-password-only';
  for (let index = 0; index < 10; index++) {
    const response = await page.request.post(
      new URL('/api/auth/login', base).href,
      {
        form: { email, password },
        maxRedirects: 0,
      },
    );
    assert.equal(response.status(), 200);
    assert.match(await response.text(), /error=invalid/);
  }
  await page.goto(new URL('/login', base).href);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  const blockedResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/login',
  );
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const blocked = await blockedResponse;
  assert.equal(blocked.status(), 429);
  assert.ok(Number(blocked.headers()['retry-after']) > 0);
  await page.waitForURL(
    (url) =>
      url.pathname === '/login' &&
      url.searchParams.get('error') === 'rate_limited',
  );
  await page
    .getByText('Thao tác quá thường xuyên.', { exact: false })
    .waitFor({ state: 'visible' });
  assert.equal(
    (await page.context().cookies()).some((cookie) =>
      cookie.name.includes('session'),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `PASS ${checks}/${checks}: localized desktop/mobile feedback and real blocked form submission. No real account or email used.`,
  );
} finally {
  await browser.close();
}
