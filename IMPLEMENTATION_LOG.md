# Zuong Zero Artist Portal - Implementation Log

Cap nhat ngay 2026-09-10, timezone van hanh: Asia/Bangkok / Asia/Saigon (UTC+7).

## Muc tieu san pham

Xay dung Zuong Zero Artist Portal de quan ly royalty cho khach hang trong linh vuc media/music. Data khong do khach hang upload. Admin/super admin tai file Excel theo tung khach hang va tung quy; khach hang chi dang nhap de xem dashboard/statement da publish.

## Kien truc da trien khai

- Frontend/backend chay tren Vinext + React, deploy Cloudflare Workers.
- Database dung Cloudflare D1, binding `DB`.
- File Excel goc luu tren Cloudflare R2, binding `FILES`.
- Auth dung co che app-owned session thay cho Cloudflare Access, bien `AUTH_PROVIDER=app-session`.
- Secrets nhu mat khau super admin, session secret, Resend API key duoc quan ly bang Worker secrets/env, khong commit vao Git.

## Phan quyen

- Super admin: dang nhap bang form duy nhat, tao tai khoan quan ly/khach hang, quan ly khach hang, upload/replace/publish/lock/delete statement, gui lai link kich hoat/reset.
- Admin/quan ly: truy cap admin console theo quyen duoc cap, quan ly van hanh du lieu khach hang.
- Client/khach hang: chi xem dashboard va statement da publish cua khach hang duoc gan, khong co quyen upload/sua/publish.

## Auth va tai khoan

- Trang login da rut gon con 1 form dang nhap duy nhat.
- Tai khoan super admin duoc bootstrap/kiem tra bang cau hinh server.
- Super admin tao tai khoan client thi dong thoi tao mot khach hang moi, khong phai chon khach hang co san.
- Ho tro link kich hoat tai khoan va link reset/doi mat khau.
- Ho tro trang quen mat khau.
- Trang quen mat khau tu dong gui reset link cho tai khoan da kich hoat; neu tai khoan chua kich hoat/chua co password thi gui lai link kich hoat de khach dat mat khau lan dau.
- Ho tro trang tai khoan ca nhan de cap nhat profile va doi mat khau.
- Them nut dang xuat tren giao dien admin/client.

## Dashboard client

- Khach hang chi xem du lieu read-only.
- Neu chua co statement da publish, van hien thi dashboard rong voi cac chi so/charts ve 0 thay vi man hinh thong bao rieng.
- Du lieu dashboard lay theo statement moi nhat da publish cua client.
- Chart duoc bo tri theo mau data Excel: kenh, configuration, territory, source, sub-source, track, artist, release, label.

## Admin console

- Co cac tab chinh: Tong quan, Khach hang, Statement, GM, Nhac lich, Email, Tai khoan.
- Tong quan admin tong hop du lieu tat ca khach hang theo quy: doanh thu, so statement, so track, so artist, trend track, trend artist, top customers.
- Ky doi soat dung quy lich duong, timezone UTC+7, ap dung dong bo cho admin va client.
- Trang khach hang ho tro tim kiem, loc trang thai, sua thong tin, archive, xoa.
- Trang statement ho tro upload .xlsx theo tung khach hang/quy hoac file tong nhieu ma khach hang, replace neu upload nham, publish/unpublish/lock/delete.
- Statement tu dong tinh doi soat theo nguong 1.000.000 VND: du nguong thi da thanh toan, chua du nguong thi chuyen so du sang quy sau.
- Tab GM ho tro tao Guaranteed Minimum theo khach hang + bai hat, theo doi tong GM, da recoup, balance con lai, archive/reactivate.
- Khi upload statement, neu track trong file trung voi GM active thi doanh thu track do duoc tru dan vao balance GM; khoan tru hien thi o cot GM/net costs.
- Khi replace/xoa statement, recoupment cu cua ky do duoc reverse de balance GM khong bi tru lap.
- Tab Nhac lich ho tro preview danh sach khach hang active, dry-run, gui reminder doi soat ngay, retry email loi/thieu config va xem send log.
- Tab Email ho tro kiem tra cau hinh gui mail production: `RESEND_API_KEY`, `EMAIL_FROM`, domain Resend, SPF/DKIM records, DMARC va gui email test.
- Them audit trail cho cac hanh dong quan tri quan trong.
- Cap nhat UX/UI theo huong giai tri media/music, co sidebar, visual identity, controls gon hon.
- Da sua loi tab admin bi lech va tranh tran ngang layout.

## Xu ly Excel

- Chi chap nhan file `.xlsx`.
- Gioi han upload hien tai: 15MB.
- Parser doc workbook Excel, map cac cot chinh nhu Net Payable/Revenue, Sales, Partner, Sub Source, Distribution Channel, Territory, Track, Track Artist, Release, Release Label.
- Du lieu chi su dung VND/VNĐ va cac breakdown phuc vu dashboard.
- File data chuan tu 2026-09-10 la workbook co cac cot: `Account No.`, `Contract Name`, `Type`, `Start Date`, `Period End Date`, `Release Title`, `Release Artist`, `ISRC`, `Track Title`, `Track Version`, `Track Artist`, `Sales Period`, `Release Label`, `Territory`, `Distribution Channel`, `Configuration`, `Partner`, `Sales`, `Gross Income`, `Royalty Rate`, `Net Payable`, `Currency`.
- Quy uoc file chuan: `Account No.` la ID khach hang dung cho bulk import; `ISRC` la ID bai hat dung cho GM/song tracking; `Partner` la platform/source; `Distribution Channel` la configuration; `Sales` la units.
- 2026-09-10: da them bang D1 `statement_line_items` va migration `drizzle/0010_statement_line_items.sql` de luu du 22 cot file chuan theo tung dong statement. Cot trung voi logic cu tiep tuc nuoi dashboard/breakdown; cot moi nhu `Contract Name`, `Type`, `Start Date`, `Period End Date`, `Release Artist`, `Track Version`, `Sales Period`, `Configuration`, `Gross Income`, `Royalty Rate` duoc luu trong detail rows va export.
- UX/UI da co bang mapping 22 cot trong admin upload panel va bang `Du lieu chuan theo dong` tren client dashboard. Export Excel statement co sheet `Source Rows` gom du 22 cot.
- Parser da sua bug o self-closing blank cells trong XLSX: cac o rong nhu `Configuration` khong con nuot gia tri o ke tiep, nen `Partner` doc dung tu cot Partner.
- Phase 1 da chuyen period sang dinh dang quy `YYYY-Q1` den `YYYY-Q4`.
- Phase 2 da them che do file tong nhieu khach hang: Excel chuan dung cot `Account No.` lam ID khach hang; backend match voi client active va tu SUM theo tung client/noi dung.
- Phase 2 ap dung nguong doi soat 1.000.000 VND de xac dinh `da thanh toan` hoac `chua thanh toan + chuyen quy sau`.
- Phase 3 them track revenue day du trong parser de GM match tren toan bo file, khong phu thuoc top track hien thi tren dashboard.
- GM recoup uu tien match bang `ISRC`/`track_external_id`; neu GM cu khong co ID bai hat thi moi fallback theo ten bai hat da normalize.
- Backend validate lai file truoc khi luu/import.

## Phase 3 - GM/advance theo bai hat

- Them bang D1 `track_guarantees` de luu GM ban dau, da recoup, balance, status theo client va track.
- Them bang D1 `track_guarantee_recoupments` de luu lich su moi lan statement tru tien GM theo period/upload.
- API admin moi: `GET/POST/PATCH /api/admin/guarantees`.
- Rule recoup: chi ap dung cho track co doanh thu duong; tru toi da bang doanh thu track trong ky va balance GM con lai; balance ve 0 thi status `recouped`.
- `statements.net_costs` duoc dung lam tong GM recoup trong ky; cong thuc doi soat giu nguyen: opening + revenue - GM - reserve + release.
- Client dashboard hien thi metric `GM Recouped`, cot GM trong ledger, va bang GM cua khach hang.
- Audit log co nhan: tao GM, archive GM, kich hoat GM.
- Co guard phong truong hop moi truong nao chua apply migration GM: dashboard van load va upload cu khong bi loi; tao/cap nhat GM se bao can chay migration 0006.

## Phase 4 - Nhac doi soat ngay 15

- Them bang D1 `settlement_reminder_runs` de luu moi lan chay reminder: period, ngay reminder, loai chay, status, so target/sent/skipped/failed/not configured.
- Them bang D1 `settlement_reminder_deliveries` de luu log tung email theo client/user/status/error.
- Them API admin `GET/POST /api/admin/reminders` de preview danh sach nguoi nhan, dry-run, gui ngay va retry email loi.
- Danh sach nguoi nhan lay tu client active + user client active; chi gui email khi period da co statement `published`/`locked`, client chua co statement duoc tinh skipped.
- Them email template nhac doi soat qua Resend, link ve `https://artistportal.zuongzeroent.com/login` theo default hoac `APP_BASE_URL` neu cau hinh.
- Them Worker entry `worker.ts` de giu request web qua Vinext va bo sung scheduled event.
- Them Cloudflare cron `0 2 15 * *`, tuong ung 09:00 ngay 15 hang thang theo gio Viet Nam/Bangkok.
- Admin console co tab Nhac lich voi summary ky hien tai, so recipient co the gui, so khach chua co statement, nut Dry-run/Gui ngay/Retry loi va bang send log.
- Audit log co nhan: preview reminder, gui reminder, retry reminder.

## Phase 5 - Email production

- Them API admin `GET/POST /api/admin/email`.
- `GET /api/admin/email` kiem tra trang thai `RESEND_API_KEY`, `EMAIL_FROM`, domain gui, Resend domain status/capability, DNS records tu Resend va DMARC `_dmarc.<domain>`.
- `POST /api/admin/email` voi action `send_test` gui email test that qua Resend toi dia chi admin nhap.
- Them email template test production va idempotency key cho request test email.
- Them tab Email trong admin console de hien thi readiness, from address, portal URL, Resend domain, sending status, DMARC, DNS records va nut gui test.
- Them audit log `email_test_sent` cho moi lan gui email test, khong luu secret.
- Worker production da co secret names `RESEND_API_KEY` va `EMAIL_FROM`.

## Phase 6 - Test va van hanh production

- Them script `npm run test`, `npm run test:unit`, `npm run test:contracts` va `npm run test:production`.
- Unit test bao phu logic doi soat nguong 1.000.000 VND, carry-forward, period theo quy lich duong UTC+7, helper auth/session/password, va GM recoup/reverse.
- Contract test doc source de chan regression bao mat: moi API admin phai co session + admin guard, hanh dong xoa khach hang/statement can super admin, tao account client phai tao khach hang moi, upload chi nhan `.xlsx` theo quy va co bulk matching, dashboard client co empty state, admin co aggregate trend.
- Production smoke test chi doc `https://artistportal.zuongzeroent.com`: kiem `/login`, `/forgot-password` tra 200 va cac API admin nhay cam tra 401 khi chua dang nhap.
- Phase nay khong doi schema D1/R2 va khong yeu cau deploy Worker moi; muc tieu la tao lop regression gate truoc cac lan deploy tiep theo.

## Bao mat

- Client khong co API upload/sua statement.
- Session cookie dat `HttpOnly`, `SameSite=Strict`, `Secure` tren HTTPS.
- Password hash bang PBKDF2-SHA256, salt rieng moi password.
- Session token luu dang hash trong DB.
- Co hash IP/user-agent cho audit/session metadata thay vi luu raw gia tri nhay cam.
- Cac API admin bat buoc user co role admin/super_admin.
- Cac API client chi tra du lieu cua client duoc gan.
- Khong dua secret vao source code hoac file commit.

## Cloudflare / deploy

- Worker production: `royalty-dashboard`.
- URL production chinh: https://artistportal.zuongzeroent.com
- D1 database: `royalty-dashboard-db`.
- R2 bucket: `royalty-dashboard-files`.
- Cau hinh deploy nam trong `wrangler.cloudflare.jsonc`.
- Lenh build: `npm run build`.
- Lenh deploy: `npx wrangler deploy --config wrangler.cloudflare.jsonc`.
- Chinh sach deploy tu 2026-09-09: chi deploy production bang Cloudflare/Wrangler va chi ban giao URL `https://artistportal.zuongzeroent.com`; khong deploy/ban giao qua URL `chatgpt.site`.
- 2026-09-10: da apply D1 migration Phase 3 `0006_track_guarantees` bang lenh execute SQL truc tiep va deploy Worker Phase 3 len Cloudflare, version `dde0f42e-5d9d-4f20-b605-211fd38a8690`; production `/login` tra `200 OK`.
- 2026-09-10: da apply D1 migration Phase 4 `0007_settlement_reminders` bang lenh execute SQL truc tiep va deploy Worker Phase 4 len Cloudflare, version `f0df8f03-f149-4fbf-9900-71d9b3337d9b`; cron production `0 2 15 * *`.
- 2026-09-10: da deploy Worker Phase 5 len Cloudflare, version `8900420f-75ec-4e0a-86b7-5f57de0d0da1`; production co tab Email va API `/api/admin/email`.
- 2026-09-10: login OTP email DEPLOYED. Login bang email/password chi tao OTP challenge va gui ma 6 so qua Resend; session chi duoc tao sau khi submit OTP thanh cong tai `/login/verify`. D1 da co bang `auth_login_otps`; Worker version `82317518-1f59-4932-8d0c-a5afef2380c0`.
- 2026-09-10: GM track external ID DEPLOYED. Form tao GM co them truong optional `ID bai hat`, luu vao `track_guarantees.track_external_id`, hien thi trong GM ledger/admin va dashboard client de tracking. Worker version `18dfb848-a3a1-4eb8-bb5c-228ec7fe2dd8`.

## Kiem thu da chay

- 2026-09-10: usage check - Codex primary 1%, weekly 28%, con 2 reset credits available.
- 2026-09-10: `npx drizzle-kit generate --name track_guarantees`
- 2026-09-10: `npx oxlint app\api\admin\guarantees\route.ts app\api\admin\uploads\route.ts app\api\admin\statements\route.ts app\api\admin\customers\route.ts components\admin-console.tsx components\royalty-dashboard.tsx lib\guarantees.ts lib\xlsx-royalty-parser.ts lib\client-dashboard-data.ts lib\admin-dashboard.ts lib\admin-activity.ts app\page.tsx db\schema.ts`
- 2026-09-10: `npm run build`
- 2026-09-10: thu chay `npx wrangler d1 migrations list royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc`; Cloudflare tra `7403` tren endpoint migration-list/query.
- 2026-09-10: `npx wrangler d1 execute royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc --file drizzle/0006_track_guarantees.sql` thanh cong: 7 queries executed, tao bang `track_guarantees` va `track_guarantee_recoupments`.
- 2026-09-10: verify D1 remote bang `SELECT name FROM sqlite_master ...`; ca hai bang GM da ton tai, `guarantee_count = 0`, `recoupment_count = 0`.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `dde0f42e-5d9d-4f20-b605-211fd38a8690`.
- 2026-09-10: verify production `https://royalty-dashboard.hung-hq197.workers.dev/login` tra `200 OK`, `https://artistportal.zuongzeroent.com/login` tra `200 OK`, `GET /api/admin/guarantees` khi chua dang nhap tra `401` dung ky vong.
- 2026-09-10: `npx oxlint db\schema.ts lib\email.ts lib\settlement-reminders.ts app\api\admin\reminders\route.ts worker.ts vite.config.ts lib\admin-activity.ts components\admin-console.tsx env.d.ts`.
- 2026-09-10: `npm run build` thanh cong voi route moi `/api/admin/reminders`.
- 2026-09-10: `npx drizzle-kit generate --name settlement_reminders`, tao migration `drizzle/0007_settlement_reminders.sql`.
- 2026-09-10: `npx wrangler d1 execute royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc --file drizzle/0007_settlement_reminders.sql` thanh cong: 8 queries executed, tao bang `settlement_reminder_runs` va `settlement_reminder_deliveries`.
- 2026-09-10: verify D1 remote bang `SELECT name FROM sqlite_master ...`; hai bang reminder da ton tai, `run_count = 0`.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `f0df8f03-f149-4fbf-9900-71d9b3337d9b`, schedule `0 2 15 * *`.
- 2026-09-10: verify production `https://artistportal.zuongzeroent.com/login` tra `200 OK`, `GET https://royalty-dashboard.hung-hq197.workers.dev/api/admin/reminders` khi chua dang nhap tra `401` dung ky vong.
- 2026-09-10: `npx oxlint lib\email.ts lib\email-production.ts app\api\admin\email\route.ts lib\admin-activity.ts components\admin-console.tsx`.
- 2026-09-10: `npm run build` thanh cong voi route moi `/api/admin/email`.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `8900420f-75ec-4e0a-86b7-5f57de0d0da1`, schedule `0 2 15 * *`.
- 2026-09-10: verify production `https://artistportal.zuongzeroent.com/login` tra `200 OK`, `GET https://royalty-dashboard.hung-hq197.workers.dev/api/admin/email` khi chua dang nhap tra `401` dung ky vong.
- 2026-09-10: `npx wrangler secret list --config wrangler.cloudflare.jsonc` xac nhan Worker co secret names `EMAIL_FROM` va `RESEND_API_KEY`.
- 2026-09-10: `npx oxfmt --write package.json tests\unit\settlements.test.mjs tests\unit\reporting-periods.test.mjs tests\unit\app-auth.test.mjs tests\unit\guarantees.test.mjs tests\static\security-contracts.test.mjs tests\production-smoke.mjs`.
- 2026-09-10: `npx oxlint package.json tests\unit\settlements.test.mjs tests\unit\reporting-periods.test.mjs tests\unit\app-auth.test.mjs tests\unit\guarantees.test.mjs tests\static\security-contracts.test.mjs tests\production-smoke.mjs`.
- 2026-09-10: `npm run test` thanh cong: 13 unit tests + 6 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi them bo test Phase 6.
- 2026-09-10: `npm run test:production` thanh cong tren `https://artistportal.zuongzeroent.com`: `/login` va `/forgot-password` tra 200, cac API admin overview/accounts/email/reminders/statements tra 401 khi chua dang nhap.
- 2026-09-10: fix forgot-password production: tai khoan pending/no-password se nhan lai activation email thay vi im lang; tai khoan active/co-password van nhan password reset email.
- 2026-09-10: `npx oxfmt --write app\api\auth\forgot-password\route.ts tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npx oxlint app\api\auth\forgot-password\route.ts tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 13 unit tests + 7 contract tests.
- 2026-09-10: `npm run build` thanh cong voi fix forgot-password.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `8d1b4c97-e880-4866-908a-db9a01bd5aa9`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy; test POST `/api/auth/forgot-password` cho account pending `hungnpoil@gmail.com` tra `303`, Worker log bao `Đã gửi email kích hoạt`, D1 tao invite `account_activation` pending moi het han `2026-09-17T03:41:46.830Z`.
- 2026-09-10: `npx drizzle-kit generate --name login_otps`, tao migration `drizzle/0008_login_otps.sql`.
- 2026-09-10: `npx oxlint app\api\auth\login\route.ts app\api\auth\verify-login\route.ts app\login\verify\page.tsx app\login\page.tsx db\schema.ts lib\email.ts lib\login-otp.ts tests\static\security-contracts.test.mjs tests\unit\login-otp.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 8 contract tests.
- 2026-09-10: `npm run build` thanh cong voi route moi `/api/auth/verify-login` va `/login/verify`.
- 2026-09-10: demo local `http://localhost:3000/login` va `http://localhost:3000/login/verify` tra `200 OK`.
- 2026-09-10: `npx wrangler d1 execute royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc --file drizzle/0008_login_otps.sql` thanh cong: 4 queries executed, tao bang `auth_login_otps` va 3 index.
- 2026-09-10: verify D1 remote bang `SELECT name FROM sqlite_master ...`; bang `auth_login_otps` va index `idx_auth_login_otps_challenge`, `idx_auth_login_otps_user_status`, `idx_auth_login_otps_expires` da ton tai.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `82317518-1f59-4932-8d0c-a5afef2380c0`.
- 2026-09-10: `npm run test:production` thanh cong tren `https://artistportal.zuongzeroent.com`: `/login`, `/forgot-password`, `/login/verify` tra 200; cac API admin overview/accounts/email/reminders/statements tra 401 khi chua dang nhap.
- 2026-09-10: `npx drizzle-kit generate --name track_external_id`, tao migration `drizzle/0009_track_external_id.sql`.
- 2026-09-10: `npx oxlint app\api\admin\guarantees\route.ts components\admin-console.tsx components\royalty-dashboard.tsx db\schema.ts lib\guarantees.ts tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 9 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi them `ID bai hat` cho GM.
- 2026-09-10: `npx wrangler d1 execute royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc --file drizzle/0009_track_external_id.sql` thanh cong: 1 query executed, them cot `track_external_id`.
- 2026-09-10: verify D1 remote bang `PRAGMA table_info(track_guarantees)`; cot `track_external_id` da ton tai.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `18dfb848-a3a1-4eb8-bb5c-228ec7fe2dd8`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy ID bai hat cho GM.
- 2026-09-10: fix admin dashboard reload flash: bo fallback demo customers/statements khoi initial state, them empty admin overview/loading state de khong hien layout cu 2 khach truoc khi API tra ve du lieu that.
- 2026-09-10: cap nhat contract test de chan regression admin console dung `fallbackCustomers` khi khoi tao.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 9 contract tests.
- 2026-09-10: `npm run build` thanh cong sau fix admin dashboard initial loading.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `09e2ca81-8131-4475-88c3-774b5ca43abc`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy; `/login`, `/forgot-password`, `/login/verify` tra 200 va cac API admin overview/accounts/email/reminders/statements tra 401 khi chua dang nhap.
- 2026-09-10: them hover tooltip cho chart client/admin: revenue bars, breakdown bars/ranked/donut va top customer bars hien value/units/percentage khi hover.
- 2026-09-10: them pagination 10 dong/trang cho cac bang/list dai: client statements, client GM, breakdown table, admin customers, accounts, statements, GM, reminder recipients/runs va audit trail.
- 2026-09-10: `npx oxlint components\admin-console.tsx components\royalty-dashboard.tsx components\table-pagination.tsx components\chart-hover-tooltip.tsx tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 9 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi them chart tooltip va pagination.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `af9b19ea-334d-4c52-850b-8f71180aaa0f`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy chart tooltip/pagination; `/login`, `/forgot-password`, `/login/verify` tra 200 va cac API admin overview/accounts/email/reminders/statements tra 401 khi chua dang nhap.
- 2026-09-10: bien left console rail thanh dieu huong that: admin rail doi tab tong quan/khach hang/statement/GM/nhac lich/email/tai khoan, client rail scroll den tong quan/statement/breakdown va link tai khoan.
- 2026-09-10: `npx oxlint components\music-brand.tsx components\admin-console.tsx components\royalty-dashboard.tsx tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 9 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi them chuc nang cho console rail.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `0432f8d5-e2ae-46f9-b594-d78da961d706`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy console rail; `/login`, `/forgot-password`, `/login/verify` tra 200 va cac API admin overview/accounts/email/reminders/statements tra 401 khi chua dang nhap.
- 2026-09-10: Phase 7 export statement CODE DONE: them API export PDF/Excel cho client/admin theo `reportPeriodId`, chi client dung assignment moi tai duoc statement published/locked cua minh, admin tai duoc statement VND trong console.
- 2026-09-10: Phase 7 them audit download: moi lan export ghi `statement_export_pdf` hoac `statement_export_excel` vao `audit_logs` kem client, period, currency, format va status.
- 2026-09-10: Phase 7 them UI tai file: client co nut PDF/Excel o Statement moi nhat va Ledger; admin co nut PDF/Excel tren tung statement trong tab Statement.
- 2026-09-10: `npx oxfmt --write lib\statement-export.ts app\api\admin\statements\[reportPeriodId]\export\route.ts app\api\statements\[reportPeriodId]\export\route.ts components\royalty-dashboard.tsx components\admin-console.tsx lib\admin-activity.ts tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npx oxlint lib\statement-export.ts app\api\admin\statements\[reportPeriodId]\export\route.ts app\api\statements\[reportPeriodId]\export\route.ts components\royalty-dashboard.tsx components\admin-console.tsx lib\admin-activity.ts tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 16 unit tests + 10 contract tests.
- 2026-09-10: `npm run build` thanh cong, da dong goi route `/api/statements/:reportPeriodId/export` va `/api/admin/statements/:reportPeriodId/export`.
- 2026-09-10: bo sung `tests/production-smoke.mjs` de verify export route cua admin/client deu tra `401` khi chua dang nhap.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc`, Worker version `030ca940-09d4-4f44-8036-810ed4322eb6`.
- 2026-09-10: `npm run test:production` thanh cong sau deploy Phase 7; `/login`, `/forgot-password`, `/login/verify` tra 200, cac API admin va export statement admin/client tra 401 khi chua dang nhap.
- 2026-09-10: cap nhat parser theo file data chuan `test.xlsx`: `Account No.` la ID khach hang, `ISRC` la ID bai hat, `Partner` la source/platform, `Distribution Channel` la configuration; GM recoup uu tien match bang ISRC truoc khi fallback theo ten bai hat.
- 2026-09-10: `npx oxlint lib\xlsx-royalty-parser.ts lib\guarantees.ts app\api\admin\uploads\route.ts components\admin-console.tsx lib\dashboard-data.ts tests\unit\guarantees.test.mjs tests\static\security-contracts.test.mjs`.
- 2026-09-10: `npm run test` thanh cong: 17 unit tests + 10 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi cap nhat mapping file chuan.
- 2026-09-10: CODE DONE cho standard 22-column line items: them `lib/statement-line-items.ts`, bang/migration `statement_line_items`, import detail rows, client detail UI, admin schema UI, export sheet `Source Rows`, cleanup khi xoa/replace statement/client.
- 2026-09-10: verify parser voi file that `C:\Users\huynh\OneDrive\Desktop\test.xlsx`: doc 1 client, 1.349 dong, `VND`, tong `Net Payable` 782.027.729,98; `Partner` doc dung Spotify/Apple Music/YouTube sau fix self-closing cells.
- 2026-09-10: `npx oxlint lib\xlsx-royalty-parser.ts app\api\admin\uploads\route.ts app\api\admin\statements\route.ts app\api\admin\customers\route.ts lib\client-dashboard-data.ts components\royalty-dashboard.tsx components\admin-console.tsx lib\statement-export.ts lib\dashboard-data.ts db\schema.ts tests\static\security-contracts.test.mjs lib\statement-line-items.ts`.
- 2026-09-10: `npm run test` thanh cong: 17 unit tests + 10 contract tests.
- 2026-09-10: `npm run build` thanh cong sau khi them line item schema/UI/export.
- 2026-09-10: thu apply remote D1 migration `drizzle/0010_statement_line_items.sql` bang `npx wrangler d1 execute ... --file`; Cloudflare tra authentication error `10000` o endpoint import. Thu lai bang `--command` thi Cloudflare tra `7403` o endpoint query. Can cap nhat/doi `CLOUDFLARE_API_TOKEN` co quyen D1 edit/query/import cho account `2b6f84a024bc49c8d450f9bead71a702`, sau do chay lai migration.
- 2026-09-10: da them guard `hasStatementLineItemsTable` de production khong loi neu migration 0010 chua co: dashboard/export van hoat dong, upload van import tong; detail 22 cot se duoc luu sau khi migration duoc apply.
- 2026-09-10: `npx wrangler deploy --config wrangler.cloudflare.jsonc` thanh cong, Worker version `1d807731-631c-4c4e-a7a5-755d627ec45b`.
- 2026-09-10: `npm run test:production` thanh cong tren `https://artistportal.zuongzeroent.com`: `/login`, `/forgot-password`, `/login/verify` tra 200 va cac API admin/export nhay cam tra 401 khi chua dang nhap.
- Viec con lai de bat luu detail rows production: apply remote D1 migration `drizzle/0010_statement_line_items.sql` sau khi token Cloudflare co quyen D1.
- `npx oxfmt --write components/admin-console.tsx`
- `npx oxlint components/admin-console.tsx`
- `npm run build`
- Kiem tra local demo `http://localhost:3000/admin`.
- Kiem tra production `/login` tra `200 OK`.

## Roadmap cac phase

- Phase 1 - Quy + VND-only: DONE. Da chuyen ky bao cao tu thang sang quy `YYYY-Qn` va loai bo USD/ngoai te khoi luong import/dashboard.
- Phase 2 - File tong + doi soat nguong 1.000.000 VND: DONE. Da ho tro upload Excel gom nhieu ma khach hang, tu SUM theo client va tinh da thanh toan/chua thanh toan + carry forward.
- Phase 3 - GM/advance theo bai hat: DONE. Source da co migration/API/UI/recoup logic, D1 production da co hai bang GM, va Worker da deploy version `dde0f42e-5d9d-4f20-b605-211fd38a8690`.
- Phase 4 - Nhac doi soat ngay 15: DONE. Da co Cloudflare scheduled trigger ngay 15 hang thang, danh sach nguoi nhan theo client active, email Resend, send log, retry loi va preview/dry-run trong admin.
- Phase 5 - Email production: DEPLOYED. Da co tab Email/API de verify Resend domain, SPF/DKIM, DMARC va gui email test that; can admin dang nhap va bam gui test de xac nhan mailbox nhan mail.
- Phase 6 - Test va van hanh production: DONE. Da co unit/contract test va production smoke test de kiem auth, upload single/bulk contract, publish/delete guard, GM recoup/reverse, dashboard client/admin va domain production.
- Phase 7 - Bao cao/export doi soat: DEPLOYED. Da co export PDF/Excel statement theo quy cho client/admin va download audit; con nen tach tiep lich su thanh toan/payment marking thanh buoc tiep theo neu can van hanh doi soat that.
- Phase 8 - Data chuan 22 cot: WORKER DEPLOYED, D1 MIGRATION PENDING. Da merge file `test.xlsx` lam schema chuan, UI admin/client hien mapping/detail, export co sheet `Source Rows`; Worker co guard khi bang chua ton tai. Can apply migration 0010 de bat luu du detail rows vao `statement_line_items`.
- Phase tiep theo de van hanh doi soat that: payment marking/manual paid date, lich su thanh toan theo client/quarter, export bien ban doi soat co trang thai thanh toan va audit nguoi mark paid.

## Nguyen tac ghi log cho cac lan tiep theo

- Moi phase moi hoac viec dang lam phai cap nhat file nay truoc khi ket thuc task.
- Ghi ro trang thai: `DONE`, `CODE DONE`, `DEPLOYED`, `BLOCKED`, `NOT STARTED`.
- Neu bi chan, ghi ro lenh da chay, loi tra ve, va buoc tiep theo can lam.
- Neu deploy, ghi ro domain production, Worker version ID, commit hash va lenh verify da chay.

## Viec tiep theo nen lam

- Dang nhap admin, vao tab Email, bam `Gửi test` toi email that va xac nhan mailbox nhan duoc.
- Neu tab Email bao DMARC missing, them TXT `_dmarc.<domain>` trong DNS domain gui mail.
- Test flow tao tai khoan client bang email that: tao tai khoan, nhan mail, kich hoat, doi mat khau, vao dashboard.
- Upload lai data mau cho tung client/quy va doi chieu chart voi file Excel.
- Test nghiep vu thuc te Phase 3 voi data cua admin: tao GM 100.000.000 VND cho mot track, upload statement co track do, doi chieu GM recoup va payable/carry forward.
- Test flow nhac doi soat bang email that voi mot client co statement published, gom dry-run, gui ngay va retry loi.
- Phase 7 buoc tiep theo: them lich su thanh toan/payment marking, bien lai thanh toan va bo loc audit download theo client/quy.
