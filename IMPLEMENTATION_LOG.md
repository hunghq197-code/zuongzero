# Zuong Zero Artist Portal - Implementation Log

Cap nhat ngay 2026-09-09, timezone van hanh: Asia/Bangkok / Asia/Saigon (UTC+7).

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

- Co cac tab chinh: Tong quan, Khach hang, Statement, Tai khoan.
- Tong quan admin tong hop du lieu tat ca khach hang theo quy: doanh thu, so statement, so track, so artist, trend track, trend artist, top customers.
- Ky doi soat dung quy lich duong, timezone UTC+7, ap dung dong bo cho admin va client.
- Trang khach hang ho tro tim kiem, loc trang thai, sua thong tin, archive, xoa.
- Trang statement ho tro upload .xlsx theo tung khach hang/quy, replace neu upload nham, publish/unpublish/lock/delete.
- Them audit trail cho cac hanh dong quan tri quan trong.
- Cap nhat UX/UI theo huong giai tri media/music, co sidebar, visual identity, controls gon hon.
- Da sua loi tab admin bi lech va tranh tran ngang layout.

## Xu ly Excel

- Chi chap nhan file `.xlsx`.
- Gioi han upload hien tai: 15MB.
- Parser doc workbook Excel, map cac cot chinh nhu Net Payable/Revenue, Units, Source, Sub Source, Configuration, Territory, Track, Artist, Release, Label.
- Du lieu chi su dung VND/VNĐ va cac breakdown phuc vu dashboard.
- Phase 1 da chuyen period sang dinh dang quy `YYYY-Q1` den `YYYY-Q4`.
- Backend validate lai file truoc khi luu/import.

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

## Kiem thu da chay

- `npx oxfmt --write components/admin-console.tsx`
- `npx oxlint components/admin-console.tsx`
- `npm run build`
- Kiem tra local demo `http://localhost:3000/admin`.
- Kiem tra production `/login` tra `200 OK`.

## Viec tiep theo nen lam

- Cau hinh domain gui email that trong Resend va cap nhat `EMAIL_FROM` bang domain da verify.
- Test flow tao tai khoan client bang email that: tao tai khoan, nhan mail, kich hoat, doi mat khau, vao dashboard.
- Upload lai data mau cho tung client/quy va doi chieu chart voi file Excel.
- Bo sung test tu dong cho API auth, upload, statement publish/delete neu dua vao van hanh that.
- Theo doi validation SSL/custom domain neu Sites van bao trang thai pending.
