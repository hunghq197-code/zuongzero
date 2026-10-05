# Product UX regression checks

## Song Rules And Carry-Forward (2026-10-05)

`npm run test:business` runs 13 isolated D1/R2 business regressions, including the real rule-import and statement-payment routes, snapshot conflicts, Gross Income then GM, carry-forward, export/reminder agreement, and a 5,100-row monthly aggregate. Its identity adapter is injected only by the test bundler and is not an application authentication path.

With the component preview below running on port 3212, run `node tests/browser/royalty-workflow.test.mjs`. It covers Q3/Q2 selection, financial labels/values, rule-file validation/preview/commit, and mobile layouts. Screenshots go to ignored `outputs/royalty-workflow-2026-10-05/`. The `financial` and `rules` fixture views contain synthetic data and mock API calls only.

See `TRACK_RULES_AND_BALANCES_2026-10-05.md` for business decisions, file columns, remaining work and rollout status.

This is a component-only local test harness, not an application route or an authentication bypass. The browser test intercepts admin API requests with mock data. Opening the admin harness without the test runner does not connect it to a database.

Start the isolated preview from the repository root:

```powershell
node node_modules/vite/bin/vite.js --config tests/browser/vite.config.mjs
```

In a second terminal, run the browser checks. Chrome must be installed. If Playwright is not installed in the project, point `PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs` file:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/thietke1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
node tests/browser/product-ux.test.mjs
```

The test covers deferred email/reminder reads, isolated email failures, customer/filter pagination reset, all 35 track identities across pages, and admin/client layouts at desktop and mobile sizes. Screenshots are written to the ignored `outputs/product-review-2026-10-05/` directory. No production URL, mail delivery, or database mutation is used.

Stop the isolated preview when finished. To inspect the actual application, use the ordinary `vinext dev` server instead.

## Auth feedback on the actual local app

The separate auth check uses the real login routes, not the component harness. Apply the local auth migrations first; see `PRODUCT_REVIEW_2026-10-05.md` for the schema and rollout requirements. It uses an unknown fake email to exercise throttling, writes only expiring local rate counters, and does not send email or create a user/session. Production URLs are rejected by the runner.

Start the app on a free port, then run the test in another terminal:

```powershell
npx vite --host=127.0.0.1 --port=3213 --strictPort
```

```powershell
$env:AUTH_DEMO_URL = 'http://127.0.0.1:3213'
$env:PLAYWRIGHT_MODULE = 'C:/Users/thietke1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
node tests/browser/auth-feedback.test.mjs
```

It checks desktop/mobile login and OTP wait messages, temporary service errors, and a real form submission receiving HTTP 429 before returning to login. Screenshots are in ignored `outputs/auth-demo-2026-10-05/`.

`npm run test:auth` runs the separate integration suite with real route code, an isolated in-memory Miniflare D1 database, and a mocked email provider. It requires no dev server or live credentials. Its `/test/*` handlers exist only in `tests/auth/worker.ts`, which is never an application route or deployed entry point.
