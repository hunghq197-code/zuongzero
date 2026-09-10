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
- Ho tro trang tai khoan ca nhan de cap nhat profile va doi mat khau.
- Them nut dang xuat tren giao dien admin/client.

## Dashboard client

- Khach hang chi xem du lieu read-only.
- Neu chua co statement da publish, van hien thi dashboard rong voi cac chi so/charts ve 0 thay vi man hinh thong bao rieng.
- Du lieu dashboard lay theo statement moi nhat da publish cua client.
- Chart duoc bo tri theo mau data Excel: kenh, configuration, territory, source, sub-source, track, artist, release, label.

## Admin console

- Co cac tab chinh: Tong quan, Khach hang, Statement, GM, Tai khoan.
- Tong quan admin tong hop du lieu tat ca khach hang theo quy: doanh thu, so statement, so track, so artist, trend track, trend artist, top customers.
- Ky doi soat dung quy lich duong, timezone UTC+7, ap dung dong bo cho admin va client.
- Trang khach hang ho tro tim kiem, loc trang thai, sua thong tin, archive, xoa.
- Trang statement ho tro upload .xlsx theo tung khach hang/quy hoac file tong nhieu ma khach hang, replace neu upload nham, publish/unpublish/lock/delete.
- Statement tu dong tinh doi soat theo nguong 1.000.000 VND: du nguong thi da thanh toan, chua du nguong thi chuyen so du sang quy sau.
- Tab GM ho tro tao Guaranteed Minimum theo khach hang + bai hat, theo doi tong GM, da recoup, balance con lai, archive/reactivate.
- Khi upload statement, neu track trong file trung voi GM active thi doanh thu track do duoc tru dan vao balance GM; khoan tru hien thi o cot GM/net costs.
- Khi replace/xoa statement, recoupment cu cua ky do duoc reverse de balance GM khong bi tru lap.
- Them audit trail cho cac hanh dong quan tri quan trong.
- Cap nhat UX/UI theo huong giai tri media/music, co sidebar, visual identity, controls gon hon.
- Da sua loi tab admin bi lech va tranh tran ngang layout.

## Xu ly Excel

- Chi chap nhan file `.xlsx`.
- Gioi han upload hien tai: 15MB.
- Parser doc workbook Excel, map cac cot chinh nhu Net Payable/Revenue, Units, Source, Sub Source, Configuration, Territory, Track, Artist, Release, Label.
- Du lieu chi su dung VND/VNĐ va cac breakdown phuc vu dashboard.
- Phase 1 da chuyen period sang dinh dang quy `YYYY-Q1` den `YYYY-Q4`.
- Phase 2 da them che do file tong nhieu khach hang: Excel can co cot `Ma khach hang`/`Client ID`; backend match voi client active va tu SUM theo tung client/noi dung.
- Phase 2 ap dung nguong doi soat 1.000.000 VND de xac dinh `da thanh toan` hoac `chua thanh toan + chuyen quy sau`.
- Phase 3 them track revenue day du trong parser de GM match tren toan bo file, khong phu thuoc top track hien thi tren dashboard.
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
- `npx oxfmt --write components/admin-console.tsx`
- `npx oxlint components/admin-console.tsx`
- `npm run build`
- Kiem tra local demo `http://localhost:3000/admin`.
- Kiem tra production `/login` tra `200 OK`.

## Roadmap cac phase

- Phase 1 - Quy + VND-only: DONE. Da chuyen ky bao cao tu thang sang quy `YYYY-Qn` va loai bo USD/ngoai te khoi luong import/dashboard.
- Phase 2 - File tong + doi soat nguong 1.000.000 VND: DONE. Da ho tro upload Excel gom nhieu ma khach hang, tu SUM theo client va tinh da thanh toan/chua thanh toan + carry forward.
- Phase 3 - GM/advance theo bai hat: DONE. Source da co migration/API/UI/recoup logic, D1 production da co hai bang GM, va Worker da deploy version `dde0f42e-5d9d-4f20-b605-211fd38a8690`.
- Phase 4 - Nhac doi soat ngay 15: NOT STARTED. Can thiet ke Cloudflare scheduled trigger/cron ngay 15 hang thang, danh sach nguoi nhan theo client active, noi dung email/thong bao, log da gui, retry khi loi, va che do preview/dry-run cho admin.
- Phase 5 - Email production: NOT STARTED / PARTIAL. Can verify domain gui email that trong Resend hoac provider duoc chon, cap nhat `EMAIL_FROM`, kiem tra SPF/DKIM/DMARC, test flow kich hoat tai khoan/reset password/thong bao doi soat bang email that.
- Phase 6 - Test va van hanh production: NOT STARTED. Can bo sung test tu dong cho auth, account invite/reset, upload single/bulk, publish/delete statement, GM recoup/reverse, va regression dashboard client/admin.
- Phase 7 - Bao cao/export doi soat: NOT STARTED. Chua co export PDF/Excel statement theo quy cho client/admin; neu can van hanh that nen them export statement, lich su thanh toan va download audit.

## Nguyen tac ghi log cho cac lan tiep theo

- Moi phase moi hoac viec dang lam phai cap nhat file nay truoc khi ket thuc task.
- Ghi ro trang thai: `DONE`, `CODE DONE`, `DEPLOYED`, `BLOCKED`, `NOT STARTED`.
- Neu bi chan, ghi ro lenh da chay, loi tra ve, va buoc tiep theo can lam.
- Neu deploy, ghi ro domain production, Worker version ID, commit hash va lenh verify da chay.

## Viec tiep theo nen lam

- Cau hinh domain gui email that trong Resend va cap nhat `EMAIL_FROM` bang domain da verify.
- Test flow tao tai khoan client bang email that: tao tai khoan, nhan mail, kich hoat, doi mat khau, vao dashboard.
- Upload lai data mau cho tung client/quy va doi chieu chart voi file Excel.
- Test nghiep vu thuc te Phase 3 voi data cua admin: tao GM 100.000.000 VND cho mot track, upload statement co track do, doi chieu GM recoup va payable/carry forward.
- Thiet ke cron/email ngay 15 hang thang sau khi domain email Resend san sang.
- Bo sung test tu dong cho API auth, upload, statement publish/delete neu dua vao van hanh that.
