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
- 2026-09-11: sua UX client dashboard cho Phase 8: bo bang raw `Du lieu chuan theo dong` 22 cot; cac cot da co trong chart hien huu tiep tuc dung chart cu, cac cot chua co duoc gom thanh chart/bang nho rieng nhu Sales Period, Release Artist, Type, Configuration phu, Contract, ISRC/Version va Gross/Royalty.
- 2026-09-11: `npx oxfmt --write components\royalty-dashboard.tsx tests\static\security-contracts.test.mjs`.
- 2026-09-11: `npx oxlint components\royalty-dashboard.tsx tests\static\security-contracts.test.mjs`.
- 2026-09-11: `npm run test` thanh cong: 17 unit tests + 10 contract tests.
- 2026-09-11: `npm run build` thanh cong sau khi sua UX line-item insights.
- 2026-09-11: `npx wrangler deploy --config wrangler.cloudflare.jsonc` thanh cong, Worker version `c2b6eb64-2593-432a-84e8-730660b12b47`.
- 2026-09-11: `npm run test:production` thanh cong sau deploy UX line-item insights; `/login`, `/forgot-password`, `/login/verify` tra 200 va cac API admin/export nhay cam tra 401 khi chua dang nhap.
- `npx oxfmt --write components/admin-console.tsx`
- `npx oxlint components/admin-console.tsx`
- `npm run build`
- Kiem tra local demo `http://localhost:3000/admin`.
- Kiem tra production `/login` tra `200 OK`.
- 2026-09-19: LOCAL DEMO READY cho quan ly statement: them 3 chien luoc upload `create`, `sync`, `replace`; `create` chan ghi de statement da ton tai, `sync` giu dong cu + them dong moi + cap nhat dong trung khoa nghiep vu, `replace` thay toan bo statement.
- 2026-09-19: tab Statement co action `Bo sung` va `Thay file`; upload panel co selector `Cach cap nhat`; ghi de bat buoc xac nhan, statement `locked` bi chan sua o ca UI va API.
- 2026-09-19: sync tinh lai tong doanh thu, units, breakdown/chart, settlement va GM recoup tu tap line item sau dong bo; upload audit luu `importStrategy`, merge stats va `replaced_upload_id`.
- 2026-09-19: them unit tests cho merge idempotent, update, add va duplicate business key; `npm run test` thanh cong 21 unit tests + 10 contract tests; `npx oxlint ...` va `npm run build` thanh cong.
- 2026-09-19: demo local dang chay tai `http://localhost:3000/admin`; chua deploy production de giu dung quy trinh test demo truoc. Chuc nang `sync` production van can migration `drizzle/0010_statement_line_items.sql` duoc apply.
- 2026-09-19: PRODUCTION DEPLOY BLOCKED truoc buoc upload Worker: `npx wrangler d1 execute royalty-dashboard-db --remote --config wrangler.cloudflare.jsonc --file drizzle/0010_statement_line_items.sql` tra Cloudflare `Authentication error [code: 10000]`. Wrangler dang OAuth bang account `92abb617a9e31952e865d615bee7359e`, trong khi D1 production thuoc account `2b6f84a024bc49c8d450f9bead71a702`; `CLOUDFLARE_API_TOKEN` local dang missing. Can login Wrangler vao dung account hoac set API token co D1 Edit + Workers Scripts Edit, sau do retry migration va deploy.
- 2026-09-19: PRODUCTION DEPLOYED sau khi Wrangler login dung account `2b6f84a024bc49c8d450f9bead71a702`: migration `0010_statement_line_items.sql` thanh cong, D1 co bang `statement_line_items` va 4 index lien quan.
- 2026-09-19: `npx wrangler deploy --config wrangler.cloudflare.jsonc` thanh cong, Worker version `f7d09c03-1fed-4d45-bfb4-ea7c8fe78f20`; domain chinh `https://artistportal.zuongzeroent.com` da nhan UI/API create-sync-replace statement.
- 2026-09-19: `npm run test:production` thanh cong sau deploy; 3 trang auth tra `200`, cac API admin va export statement admin/client tra `401` khi chua dang nhap.
- 2026-09-19: PAYMENT STATUS CODE DONE + LOCAL DB READY. Them `payment_status`, `paid_at`, `paid_by_user_id` truc tiep vao `report_periods`; statement moi mac dinh `unpaid`.
- 2026-09-19: Admin co action danh dau `Da thanh toan`/chuyen lai `Chua thanh toan`; statement duoi nguong 1.000.000 VND chi hien `Chuyen ky sau` va API chan mark paid. Dashboard client va file export doc trang thai thanh toan that thay vi suy ra tu nguong.
- 2026-09-19: Khi sync/replace file, payment status tu reset ve `unpaid` de tranh giu trang thai cu sau khi so tien thay doi. Moi action payment deu ghi audit log voi actor, trang thai truoc/sau va payable.
- 2026-09-19: Migration local `drizzle/0011_statement_payment_status.sql` thanh cong; `npm test` qua 24 unit + 10 contract tests; lint cac file thay doi sach; `npm run build` thanh cong. Global `npm run lint` van con cac loi accessibility co san trong `components/ui/*` va `hooks/use-mobile.ts`, khong thuoc thay doi nay.
- 2026-09-19: PAYMENT STATUS PRODUCTION NOT DEPLOYED. Can test truc quan demo local bang tai khoan admin, sau do apply migration 0011 remote truoc khi deploy Worker.
- 2026-09-19: PAYMENT STATUS PRODUCTION DEPLOYED. Migration `drizzle/0011_statement_payment_status.sql` da apply thanh cong tren D1 remote; 15 report period cu duoc khoi tao `unpaid`, schema da xac nhan co `payment_status`, `paid_at`, `paid_by_user_id`.
- 2026-09-19: `npx wrangler deploy --config wrangler.cloudflare.jsonc` thanh cong, Worker version `8859a375-769b-4891-828f-984e87b60683`. `npm run test:production` qua toan bo login/forgot-password/OTP va auth guard cho API admin/export tren `https://artistportal.zuongzeroent.com`.
- 2026-09-19: STATEMENT TABLE UX CODE DONE, LOCAL DEMO ONLY. Rut bang admin tu 10 cot xuong 7 cot; gom Rows/Units vao `Du lieu`, Revenue/GM/Carry vao `Tai chinh`, giu thanh toan thanh action chinh ro rang.
- 2026-09-19: Gom PDF/Excel, bo sung/thay file, publish/an/lock va xoa vao menu ba cham co nhom; moi dong chi con payment action + overflow menu. `npm test` qua 24 unit + 10 contract tests, targeted lint sach va `npm run build` thanh cong. Chua deploy production de test demo truoc.
- 2026-09-19: STATEMENT TABLE UX DEPLOYED. `npx wrangler deploy --config wrangler.cloudflare.jsonc` thanh cong, Worker version `c9ed46c0-056c-4c35-9893-d62441bc584b`; `npm run test:production` qua toan bo auth page va API guard tren domain chinh.
- 2026-09-19: STATEMENT ACTION MENU HOTFIX DEPLOYED. Base UI portal menu gay client crash khi mo tren production; da thay bang native select `Thao tac` khong dung portal, van giu day du PDF/Excel, sync/replace, publish/an/lock va xoa. Worker version `6358b522-4d7e-463c-8753-b4d8ccac579a`; 34 tests, targeted lint, build va production smoke deu thanh cong.
- 2026-09-19: CLIENT DASHBOARD FINANCIAL UX CODE DONE, LOCAL DEMO ONLY. Sap xep lai so lieu thanh hai nhom `Dong tien trong quy` va `Thanh toan va so du`; luong tien hien theo thu tu tong doanh thu, cac khoan giam tru, GM, du phong giu lai/hoan lai va thuc nhan trong quy. Doi soat tach ro so du dau ky, tong phai tra, da thanh toan, chua thanh toan va chuyen ky sau.
- 2026-09-19: Dashboard client da doc them `gross_revenue`, `reserves_withheld`, `reserves_released` tu D1; cong thuc thuc nhan quy la `net_revenue - net_costs - reserves_withheld + reserves_released`, khong tao them loai chi phi suy dien ngoai data.
- 2026-09-19: Viet hoa toan bo noi dung hien thi tren dashboard client, bao gom header, trang thai, ky bao cao, chart, bang, tooltip, empty state va thanh dieu huong. Da test truc quan desktop/mobile voi data 742.563.571 VND; so dai khong tran, heading mobile khong bi cat.
- 2026-09-19: `npm test` qua 24 unit tests + 10 contract tests, targeted `oxlint` sach, `git diff --check` sach va `npm run build` thanh cong. Chua deploy production de giu quy trinh demo truoc khi deploy ban chinh.

## Phase 10 - Safe Import

- 2026-09-21: PHASE 10 SAFE IMPORT DEPLOYED. Upload Excel gio bat buoc `Kiem tra truoc khi nhap`; server parse, validate va tinh truoc rows, doanh thu, GM du kien, thuc nhan va chenh lech ma chua ghi D1/R2.
- Nut xac nhan chi hoat dong voi confirmation token gan voi SHA-256 file va preview hien tai; neu file, strategy hoac du lieu statement thay doi thi server tu choi commit cu.
- Truoc moi lan import, Worker luu snapshot statement, breakdown, line items, GM recoup va guarantee balances vao R2. Admin co `Lich su va hoan tac`, phan biet `Dang su dung`/`Da hoan tac` va chi hoan tac duoc version dang active.
- Rollback bi chan khi statement dang khoa, da thanh toan, khong phai version hien tai, hoac client co mot import active moi hon. Moi rollback ghi audit log va dua upload ve status `rolled_back` de bao toan thu tu GM.
- Da test end-to-end local create -> rollback -> replace -> rollback, xac nhan phuc hoi statement, source upload, line items va audit log; data/file/session test da duoc don sach sau kiem tra.
- Da test UX desktop 1440px va mobile 390px; preview table dung cuon ngang co kiem soat tren mobile. `npm test` qua 30 unit + 12 contract tests, targeted `oxlint`, `npx tsc --noEmit` va `npm run build` thanh cong.
- Da deploy Cloudflare Worker version `47fc2bc7-e2e6-435e-8a62-cac7a045ef75` len `https://artistportal.zuongzeroent.com` bang `npx wrangler deploy --config wrangler.cloudflare.jsonc`; `npm run test:production` qua 13/13 checks (trang auth va auth guard API), chua test import/rollback co dang nhap tren production. Phase 10 khong can migration D1 moi; snapshot dung R2 hien co va status `rolled_back` la gia tri text tuong thich schema hien tai.
- 2026-09-21: Nguoi dung xac nhan so lieu da dung sau khi nhap du lieu; chua xac nhan rollback tren production.

## Phase 11 - Isolated staging

- 2026-09-21: STAGING INFRA DEPLOYED tai `https://royalty-dashboard-staging.hung-hq197.workers.dev`, Worker version `72a10e46-2b4c-452f-9b93-b2206b307509`. D1 `royalty-dashboard-staging-db` va R2 `royalty-dashboard-staging-files` moi, tach khoi production; D1 da apply du 13 migration va xac nhan 0 clients, 0 users, 0 statements.
- `wrangler.cloudflare.jsonc` co `env.staging` voi binding rieng, `AUTH_PROVIDER=app-session`, `DEPLOYMENT_ENV=staging` va `crons=[]`; UI hien nhan `Moi truong thu nghiem`. `npm run deploy:staging` va `npm run test:staging` dung env/URL staging; smoke qua 13/13 checks va build/test local qua 30 unit + 13 contract tests.
- 2026-09-21: Da xac nhan staging co du ten bon secrets (`SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_PASSWORD`, `EMAIL_FROM`, `RESEND_API_KEY`) bang `npx wrangler secret list --config wrangler.cloudflare.jsonc --env staging`; khong doc duoc gia tri. `npm run test:staging` va `npm run test:production` deu qua 13/13 checks. Chua xac nhan email OTP thuc nhan hay test import/rollback co dang nhap tren staging. Huong dan trong `STAGING.md`; khong copy du lieu production.

## Roadmap cac phase

- Phase 1 - Quy + VND-only: DONE. Da chuyen ky bao cao tu thang sang quy `YYYY-Qn` va loai bo USD/ngoai te khoi luong import/dashboard.
- Phase 2 - File tong + doi soat nguong 1.000.000 VND: DONE. Da ho tro upload Excel gom nhieu ma khach hang, tu SUM theo client va tinh da thanh toan/chua thanh toan + carry forward.
- Phase 3 - GM/advance theo bai hat: DONE. Source da co migration/API/UI/recoup logic, D1 production da co hai bang GM, va Worker da deploy version `dde0f42e-5d9d-4f20-b605-211fd38a8690`.
- Phase 4 - Nhac doi soat ngay 15: DONE. Da co Cloudflare scheduled trigger ngay 15 hang thang, danh sach nguoi nhan theo client active, email Resend, send log, retry loi va preview/dry-run trong admin.
- Phase 5 - Email production: DEPLOYED. Da co tab Email/API de verify Resend domain, SPF/DKIM, DMARC va gui email test that; can admin dang nhap va bam gui test de xac nhan mailbox nhan mail.
- Phase 6 - Test va van hanh production: DONE. Da co unit/contract test va production smoke test de kiem auth, upload single/bulk contract, publish/delete guard, GM recoup/reverse, dashboard client/admin va domain production.
- Phase 7 - Bao cao/export doi soat: DEPLOYED. Da co export PDF/Excel statement theo quy cho client/admin va download audit; con nen tach tiep lich su thanh toan/payment marking thanh buoc tiep theo neu can van hanh doi soat that.
- Phase 8 - Data chuan 22 cot: DEPLOYED. Da merge file `test.xlsx` lam schema chuan, luu detail vao `statement_line_items`, UI client hien insight va export co sheet `Source Rows`; migration 0010 da co tren D1 production.
- Phase 11 - Staging tach rieng: DEPLOYED infra va da co du ten secrets; dang cho kiem thu OTP/import/rollback co dang nhap.
- Payment marking toi gian: DEPLOYED. Chi co `unpaid`/`paid`, paid date va actor; khong them partial payment, chung tu hay bang lich su rieng.
- 2026-09-19: CLIENT DASHBOARD FINANCIAL UX DEPLOYED. Da deploy len `https://artistportal.zuongzeroent.com` voi Worker version `5bae66af-dbeb-47e9-bbf8-4d459a3fc490`; `npm run test:production` dat 10/10 kiem tra (cac trang auth tra 200, API bao ve tra 401 khi chua dang nhap).
- 2026-09-19: CLIENT FINANCIAL SUMMARY SIMPLIFIED AND DEPLOYED. Da gom 11 the tai chinh thanh mot khoi tong quan gom doanh thu, tong giam tru, thuc nhan va ba chi so thanh toan; GM, du phong va so du duoc thu gon trong `Chi tiet cach tinh`. Da kiem tra desktop/mobile, `npm test`, `npm run build` va production smoke 10/10; Worker version `4c2b554f-3add-4300-b2b7-c429f14aca40`.
- 2026-09-21: PHASE 9 TRACK ROYALTY RULES DEPLOYED. Them quan tri ty le chia theo `client + ISRC + khoang quy`; chi dong khop rule moi tinh `Net Payable = Gross Income x ty le`, dong khong co rule giu nguyen `Net Payable` tu Excel. GM tiep tuc khau tru sau buoc nay.
- 2026-09-21: Migration `0012_track_royalty_rules.sql` tao bang rule va them snapshot `source_royalty_rate`, `source_net_payable`, `calculation_mode`, `royalty_rule_id`, `applied_royalty_rate_bps` vao line item. Rule trung ISRC va khoang hieu luc bi chan; dong co rule nhung thieu Gross Income bi chan import.
- 2026-09-21: Admin co tab `Ty le chia` de tao/sua/tam dung rule; danh sach co tim kiem, loc va phan trang. Excel export them nguon tinh, Net Payable goc va ty le da ap dung de audit.
- 2026-09-21: Local va remote D1 da apply migration `0012_track_royalty_rules.sql`; remote da xac minh co bang `track_royalty_rules`, du 5 cot audit va khoi tao 0 rule nen khong thay doi du lieu cu.
- 2026-09-21: `npm test` qua 28 unit + 11 contract tests; targeted `oxlint` sach; `npm run build` thanh cong. Da test truc quan form/list/edit tren desktop 1440px va mobile 390px.
- 2026-09-21: Deploy production thanh cong tai `https://artistportal.zuongzeroent.com`, Worker version `8a71baef-9486-4253-a7ab-c08e2050638b`. `npm run test:production` qua 11/11 kiem tra, gom auth pages 200 va API `royalty-rules` cung cac API nhay cam tra 401 khi chua dang nhap.

## Statement export redesign - 2026-09-22

Trang thai: DEPLOYED PRODUCTION (da sua su co 1102, xem muc ben duoi).

- PDF statement da doi sang bao cao doi soat A4 mot trang, ho tro day du tieng Viet, gom thong tin khach hang/ky, dong tien tu gross den thuc nhan, trang thai thanh toan, units, rows va nguon doanh thu noi bat.
- Excel khong con la XML `.xls`. File tai xuong la `.xlsx` that. Neu upload single-client va R2 con file, admin/client nhan dung byte + ten file goc. Neu upload bulk, admin duoc tai file tong goc; client chi nhan workbook chi tiet 22 cot da loc theo client de khong ro ri data khach hang khac.
- Workbook sinh lai giu thu tu dong, gia tri `Royalty Rate`/`Net Payable` goc truoc rule, co dong header co dinh, auto-filter va dinh dang so. Export khong cat o 20.000 dong; neu R2 tam loi thi fallback sang workbook chi tiet tu D1.
- Van giu auth scope, published-only cho client va audit log moi lan tai. Ten file/Content-Disposition duoc sanitize va ho tro UTF-8.
- Da them unit test OOXML/PDF, doc workbook bang `openpyxl`, render PDF thanh PNG bang Poppler va kiem tra truc quan khong tran/cat. `npm test` qua 32 unit + 13 contract tests, targeted `oxlint`, `git diff --check` va `npm run build` thanh cong.
- Da deploy production tai `https://artistportal.zuongzeroent.com`, Cloudflare Worker version `db2fe80e-7067-43b5-aef1-e02dc08e78ee`. `npm run test:production` qua 13/13 checks, bao gom auth guard cho ca export PDF va Excel.

## Su co Worker 1102 va khac phuc - 2026-09-22

Trang thai: DEPLOYED PRODUCTION, can test tai file that voi phien dang nhap.

- Nguoi dung bao production hien Cloudflare Error 1102 `Worker exceeded resource limits` (Ray ID `a3f0644d89468ca6`). Ban export moi nap `pdf-lib`, `fontkit`, font TTF va tao PDF/Excel ngay trong Worker; day la nguyen nhan kha nghi nhung chua co metric CPU/memory tu Ray ID de ket luan tuyet doi.
- Da rollback production ve Worker version on dinh `ccef7e86-f28a-45bb-b2fe-3e30d0232794`; `/login` va `/login/verify` tro lai HTTP 200. Khong rollback D1/R2.
- Da sua luong export: Worker chi kiem tra quyen, lay du lieu theo tung trang 500 dong va tra JSON; file goc tren R2 duoc stream. PDF va workbook fallback duoc tao trong trinh duyet sau khi bam tai, khong nap thu vien PDF/font vao export API Worker. Scope client, published-only va audit van giu nguyen.
- `npm test` qua 32 unit + 13 contract, `npx tsc --noEmit`, targeted `oxlint` va `npm run build` dat. Toan repo `npm run lint` con 17 loi co san o `components/ui/*` va `hooks/use-mobile.ts`, khong phai cac file vua sua.
- Da deploy staging version `eb5cba4f-3a00-49cf-8e33-375289bf1114`: smoke 13/13 va 30 request trang cong khai lien tiep dat. Da deploy production version `7b02b4dc-3813-4b0b-a7ba-a38730765c57`: smoke 13/13 va 40 request trang cong khai lien tiep dat, khong tai hien 1102.
- Chua test tai PDF/Excel bang phien admin/client that tren staging vi khong co phien dang nhap/OTP trong task. Can thu mot statement co du lieu, doi chieu PDF mot trang va Excel tai lai voi file upload, sau do theo doi Worker Logs neu su co tai hien.

## Nguyen tac ghi log cho cac lan tiep theo

- Moi phase moi hoac viec dang lam phai cap nhat file nay truoc khi ket thuc task.
- Ghi ro trang thai: `DONE`, `CODE DONE`, `DEPLOYED`, `BLOCKED`, `NOT STARTED`.
- Neu bi chan, ghi ro lenh da chay, loi tra ve, va buoc tiep theo can lam.
- Neu deploy, ghi ro domain production, Worker version ID, commit hash va lenh verify da chay.

## Viec tiep theo nen lam

- Dang nhap staging bang email super admin va mat khau rieng, xac nhan OTP den mailbox thu nghiem, sau do test import -> sync/replace -> rollback tren staging.
- Dang nhap admin, vao tab Email, bam `Gửi test` toi email that va xac nhan mailbox nhan duoc.
- Neu tab Email bao DMARC missing, them TXT `_dmarc.<domain>` trong DNS domain gui mail.
- Test flow tao tai khoan client bang email that: tao tai khoan, nhan mail, kich hoat, doi mat khau, vao dashboard.
- Upload lai data mau cho tung client/quy va doi chieu chart voi file Excel.
- Test nghiep vu thuc te Phase 3 voi data cua admin: tao GM 100.000.000 VND cho mot track, upload statement co track do, doi chieu GM recoup va payable/carry forward.
- Test flow nhac doi soat bang email that voi mot client co statement published, gom dry-run, gui ngay va retry loi.
- Test demo local payment marking tai tab Statement; neu dat, apply `drizzle/0011_statement_payment_status.sql` len D1 remote roi deploy Worker.
- Test nghiep vu Phase 9 tren production bang file co Gross Income: tao mot rule theo ISRC, import vao mot client/quy test, doi chieu dong co rule duoc tinh lai va dong khong co rule giu nguyen Net Payable tu Excel.
- Test nghiep vu Phase 10 bang mot file Excel that tren production voi tai khoan admin: xem preview, import, mo lich su, rollback va doi chieu so lieu. Chi dung client/quy test de tranh anh huong du lieu that.

## Ban giao tam dung - staging OTP (2026-09-21)

Trang thai: IN PROGRESS tu 2026-09-22 theo yeu cau tiep tuc cua nguoi dung. Chua sua ma ung dung, chua thay doi secret, chua deploy staging hay production trong luot xu ly moi. File nay la tom tat ban giao cac yeu cau, quyet dinh va bang chung hien co; khong phai ban chep nguyen van toan bo hoi thoai.

### Boi canh va yeu cau da thong nhat

- Cong production chinh la `https://artistportal.zuongzeroent.com`; staging rieng la `https://royalty-dashboard-staging.hung-hq197.workers.dev` voi D1/R2/secrets rieng. Moi thay doi nghiep vu phai duoc test tren demo/staging truoc khi can nhac deploy production.
- Bao mat la uu tien hang dau. Khach hang chi xem dashboard/statement da publish; admin/super admin quan ly khach hang, tai Excel, doi soat, GM, ty le chia theo ISRC, thanh toan, tai khoan va email. Form dang nhap co OTP gui email. Khong chia se mat khau, OTP, API key hay request body email.
- Nguoi dung da yeu cau tam dung va chua deploy ban hien tai. Khong chay `wrangler secret put` khi chua can thiet vi lenh nay tao version Worker moi va deploy ngay, du chi nham staging.

### Bang chung vua nhan va phan tich

- Dang nhap staging sau khi nhap mat khau hop le hien `Khong the gui ma OTP luc nay. Vui long thu lai sau it phut.`. Day la thong bao chung cua login flow; chua chung minh loi nam o Resend hay secret nao.
- Anh Resend Logs `GET /domains` tra HTTP 401 `restricted_api_key`: key `Onboarding` co quyen `Sending access`, chi duoc gui email. Day la han che dung quyen khi tab chan doan email truy van domains; khong tu no chung minh `POST /emails` gui OTP bi loi. Khong nang key len Full access chi de het loi chan doan.
- Anh Resend Domains chi thay `mail.zuongzeroent.com` o trang thai Verified. Sender phai thuoc domain nay. Anh Resend `POST /emails` HTTP 200 la email `Test email - Zuong Zero Artist Portal`, from `Zuong Zero Artist Portal <no-reply@mail.zuongzeroent.com>`; Resend da chap nhan email test. Anh cho thay noi dung co portal `artistportal...`, nen khong the coi day la bang chung email OTP staging da gui thanh cong. HTTP 200 cua Resend cung chua tu no xac nhan email da vao inbox.
- Code `app/api/auth/login/route.ts` tao challenge sau khi xac thuc mat khau, goi `sendLoginOtpEmail`, va redirect voi `otp_delivery` neu ket qua khac `sent`. `lib/email.ts` gui OTP qua `POST https://api.resend.com/emails`; neu thieu `RESEND_API_KEY`/`EMAIL_FROM`, Resend tu choi, hoac fetch loi thi UI cung co the hien thong bao chung.
- Staging da co ten cac secrets `SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_PASSWORD`, `EMAIL_FROM`, `RESEND_API_KEY`, nhung gia tri duoc an va chua duoc xac nhan. Secrets staging khong ke thua production. Chua co log `POST /emails` mang tieu de OTP cua lan dang nhap staging, va chua co Worker log chi ra nguyen nhan cu the.
- Da thu `wrangler tail` staging de bat log, nhung phien Wrangler OAuth refresh bi loi `400 Bad Request`/yeu cau dang nhap; khong thu duoc log. Cac tien trinh tail/OAuth do luot thu da duoc dung, khong de chay nen.

### Buoc tiep theo khi tiep tuc

1. Khong deploy production. Mo Cloudflare Dashboard > Workers & Pages > `royalty-dashboard-staging` > Logs > Live, sau do thu dang nhap staging dung mot lan.
2. Tim `[email:login-otp] resend rejected request`, `[email:login-otp] delivery failed`, hoac `[login-otp] delivery failed`. Chi luu/chia se HTTP status va thong bao loi da loai bo thong tin nhay cam.
3. Doi chieu Resend Logs cung thoi diem: tim `POST /emails` voi tieu de `Ma OTP dang nhap Zuong Zero Artist Portal`, khong nham voi `Test email` hay `GET /domains`. Khong chia se request body vi chua OTP.
4. Neu khong co `POST /emails`, kiem tra nhánh `not_configured`/Worker fetch va gia tri secrets staging mot cach an toan. Neu co POST loi, dung status + `name`/`message` de sua dung nguyen nhan. Neu POST 200, kiem tra email delivery/inbox/spam va flow challenge. Sau khi ro nguyen nhan moi quyet dinh can sua code hay secret staging; test lai staging truoc moi de xuat production.

### Tiep tuc 2026-09-22

- `npx wrangler whoami` van tra `Failed to fetch auth token: 400 Bad Request` va `Not logged in`; CLI khong the doc Worker logs. Co them canh bao sandbox khong ghi duoc Wrangler debug log o AppData, nhung loi chinh la xac thuc Cloudflare.
- Da mo Cloudflare Dashboard de nguoi dung tu dang nhap an toan, khong nhan mat khau/OTP qua chat. Trang browser hien van o `/login`; dang cho phien dang nhap de xem log `royalty-dashboard-staging`.
- Da doi chieu `app/api/auth/login/route.ts` va `lib/email.ts`: sau khi password dung va tao challenge, email OTP duoc gui bang `POST /emails`; `not_configured`, HTTP khac 2xx hoac network error deu dua ve thong bao giao dien chung. Chua co bang chung de xac dinh nhanh nao xay ra tren staging.
- Khong thay doi secret, schema, ma ung dung hay moi truong Cloudflare. Khong deploy production; chi cap nhat file ban giao nay.

### Ket qua log OTP staging (2026-09-22)

- Nguoi dung lay duoc Live logs cho `royalty-dashboard-staging`, request `POST /api/auth/login`. Log `[email:login-otp] resend rejected request` cho thay Resend tra HTTP 401 `validation_error` voi message `API key is invalid`; log `[login-otp] delivery failed` la he qua. Day la loi cua gia tri `RESEND_API_KEY` tren staging, khong phai loi quyen `Sending access` o request `GET /domains` truoc do.
- Chua co thay doi secret hay deploy de khac phuc. Can tao mot Resend API key moi cho staging voi `Sending access`, gioi han domain `mail.zuongzeroent.com` neu UI cho phep; nhap key truc tiep vao secret `RESEND_API_KEY` cua Worker staging. Khong gui key qua chat, khong ghi vao Git. Cloudflare Dashboard se yeu cau Deploy de ap dung secret len staging; khong thay code hay production.
- Sau khi secret staging duoc cap nhat, thu dang nhap staging lai mot lan. Neu Resend chap nhan OTP ma van loi, kiem tra Live logs/Resend POST `/emails` moi nhat; xac nhan `EMAIL_FROM` staging thuoc domain `mail.zuongzeroent.com`. Sau do moi test luong import/rollback tren staging.
