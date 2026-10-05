# Bai Hat, Ty Le Chia Va So Du Chuyen Quy

Ngay: 2026-10-05. Nhanh goc: `main`, commit goc `1ef3e41`.
Trang thai: DEPLOYED PRODUCTION version `96f84c58-2cdc-4a77-9eab-cfbac5f341cf`; CHUA commit/push.
Production duy nhat: Cloudflare, `https://artistportal.zuongzeroent.com`.

## Yeu Cau Va Quy Uoc Da Chot

1. Khach hang duoc gan truoc voi bai hat theo cap `Account No.` + `ISRC` trong `track_royalty_rules`. Tai khoan user nhan quyen cua khach hang qua `client_users`, khong gan bang ten bai hat hay email trong workbook.
2. Nguoi dung xac nhan ty le chia ap dung tren **Gross Income**, roi moi khau tru GM. ISRC la ID bai hat; Account No. la ID khach hang.
3. File ty le khong phai file doanh thu. Import ty le khong tu sua statement da publish. Muon tinh lai mot ky phai dung luong upload statement co preview; ky da thanh toan/da khoa phai duoc mo lai truoc.
4. Dong doanh thu chua co quy tac rieng van giu Net Payable trong Excel, theo hanh vi da co. Khong tu phan bo mot dong doanh thu sang nhieu khach hang, khong suy doan khach hang tu ten bai hat.
5. Nguong hien tai van la **>= 1.000.000 VND**. Du nguong khong dong nghia da chuyen tien.

## Nhap Danh Sach Bai Hat

- Tab **Ty le chia** co **Tai file mau**, **Xem truoc**, **Xac nhan luu ty le**.
- Endpoint co xac thuc admin: `GET /api/admin/royalty-rules/import` tai XLSX rong; `POST` preview/commit.
- Cot mau: `Account No.`, `ISRC`, `Track Title`, `Royalty Rate`, `Effective From`, `Effective To`.
- Account No. can giu dinh dang text neu co so 0 o dau. ISRC hop le 12 ky tu; bo qua dau gach ngang/khoang trang khi chuan hoa.
- Royalty Rate chap nhan `80`, text `80%`, hoac Excel numeric 0.8 co percentage format. **0.8 khong co percentage format nghia la 0.8%, khong phai 80%.** Ty le tu 0 den 100%, toi da 2 so thap phan.
- Effective From bat buoc, dang `2026-Q3`. Effective To co the de trong (khong gioi han). Track Title de trong thi giu ten cu hoac dung ISRC neu tao moi.
- Khoa upsert: khach hang + ISRC + quy bat dau. Preview chi ro tao moi/cap nhat/giu nguyen; gia tri va khoang hieu luc cu luu trong audit metadata.
- Khach hang khong ton tai/da archive, cong thuc, o Excel loi, ty le sai, dong trung, khoang quy chong lan se chan ca file. Khach hang locked van duoc admin gan quy tac, nhu CRUD hien co.
- Gioi han: 2 MB/file, 500 dong, 10 sheets, 16 MB giai nen, 200 ZIP entries. Header la dong co du lieu dau tien moi sheet. Khong them sheet huong dan vao file upload.
- File mau khong co dong khach hang gia de tranh nhap nham. Header duoc to mau va freeze; dung chung XLSX writer cua ung dung.
- Token xac nhan gan voi workbook, admin va snapshot du lieu. Commit parse/validate lai, recheck snapshot ben trong D1 batch va ghi tat ca quy tac/audit cung transaction. Preview cu/concurrent overwrite bi tra 409, khong ghi mot phan.
- Can rut ngan quy tac dang mo truoc khi them quy tac cho quy sau neu khoang cu van chong lan. File giong het chi hien thi giu nguyen; nut luu khong can bat.

## Dashboard Va Thang Phat Sinh

- Da bo metric Tong giam tru va panel Chi so tai chinh bo sung. Chi tiet GM/reserve trong doi soat van giu de co the giai trinh so tien.
- Cong thuc: thuc nhan quy = net revenue - GM - reserve withheld + reserve released; tong doi soat = so du dau ky + thuc nhan quy.
- Hien rieng: so du ky truoc chuyen sang, thuc nhan trong quy, tong so du den ky nay, da thanh toan, so du chuyen ky sau.
- Chart thang dung aggregate SQL theo client + statement quarter, khong bi gioi han 5.000 dong nhu danh sach chi tiet. Chuyen dropdown quy doi nguon du lieu va nhan bao cao cung nhau.
- Chuan hoa YYYY-MM, MM/YYYY, YYYYMM, MMYYYY, ISO date, date dd/mm/yyyy, ten thang tieng Anh va Excel 1900-system serial. Sap xep theo thoi gian, khong theo doanh thu.
- Sales Period ghi Q2 trong statement Q3 thi van giu Q2 va gan nhan chua ro thang. Khong phan bo ca quy vao thang cuoi ky; chi fallback Start Date/Period End Date khi Sales Period rong va hai moc cung mot thang.
- Chua co file/live data tai hien chinh xac truong hop nguoi dung bao Q3 thanh Q2. Da test viec doi quy, date parsing va loc du lieu; can doi chieu workbook thuc te tren staging truoc rollout, dac biet neu du lieu co do tre doi soat.
- Sua chieu cao tabs phan tich de wrap tren mobile ma khong de len chart.

## So Du Va Thanh Toan

- `lib/statement-balances.ts` tinh lai ledger theo thu tu quy cho tung khach hang, tu cac statement VND published/locked. Draft/replaced khong chuyen so du; khong lay opening cu cua mot ky chua thanh toan lam so du moi.
- So du cuoi = opening da tinh lai + revenue - GM - reserve withheld + reserve released - so tien da thanh toan thuc te.
- Vi du: Q1 chua tra 600.000 + Q2 thuc nhan 700.000 => Q3 opening 1.300.000. Khi admin danh dau Q2 da tra 1.300.000 thi Q3 opening ve 0.
- Khi mark_paid, opening hien tai va payment status luu cung D1 batch. Mark_paid lap lai khong ghi de payment snapshot. Mark_unpaid tinh lai carry cho cac quy sau chua chot.
- Voi du lieu lich su da tra, so tien tra duoc suy ra tu opening/revenue/costs da luu tai ky do, **khong tu nang so tien da tra** khi phat hien carry cu bi bo sot. Phan chenh con no tiep tuc chuyen quy. Can doi chieu chung tu truoc khi rollout neu du lieu cu bi sai.
- Khong co tinh nang opening balance ngoai he thong trong dot nay; ledger bat dau tu 0 truoc statement dau tien con hieu luc. Khong tu chuyen opening cu cua ky da an/xoa vao ky ke tiep.
- Import, doi trang thai, xoa va rollback se tu choi sua ky truoc neu co ky sau da thanh toan/da khoa. Mo/hoan tac tu ky moi nhat truoc. Statement da tra khong duoc an/xoa truc tiep.
- Dashboard admin/client, export, import preview/commit va reminder cung doc ledger. Reminder khong con goi so tien du nguong la so tien da tra.
- Tranh van hanh nhieu thao tac import/thanh toan tren cung mot khach hang dong thoi. Import statement cu van ghi D1 theo chunks va rollback co nhieu batch; khoa giao dich theo client cho toan bo cac luong la hang muc tiep theo, khong nam trong transaction atomic cua import ty le moi.

## Kiem Thu Da Chay

- `npm ci --no-audit --no-fund`: cai dung lockfile. Khong them dependencies hay doi lockfile.
- `npm test`: 81/81 (35 unit, 15 contracts, 18 auth, 13 business). Email outbound mock; Miniflare D1/R2 tach biet, khong dung production.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: pass.
- Lint source thay doi va cac test moi: pass. Chay lint kem `tests/static/security-contracts.test.mjs` gap loi no-floating-promises co san; khong refactor bo test cu trong dot nay.
- `npm run build`: pass; con canh bao client chunk >500kB va plugin timings. Khong deploy tu lenh build.
- `tests/browser/royalty-workflow.test.mjs`: pass, desktop 1440x1000/mobile 390x844, doi quy/thang, so du, an cac metric, import preview loi/commit/refresh; khong co pageerror/tran ngang.
- `tests/browser/product-ux.test.mjs`: pass cho cac regression cu.
- Da xem screenshots trong `outputs/royalty-workflow-2026-10-05/` (ignored).
- Ung dung local: `http://127.0.0.1:3213/login` tra 200 va co form login. Khong login/send OTP vao tai khoan that trong dot nay.

## Phat Hanh Production Theo Xac Nhan

- Da deploy ngay 2026-10-05 len Cloudflare Worker `royalty-dashboard`, domain chinh o dau file; khong deploy ChatGPT Sites hay doi DNS.
- Lenh: `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.cloudflare.jsonc --env= --keep-vars`. Giu vars/secrets, cron va bindings hien co. Khong can migration moi.
- Version moi `96f84c58-2cdc-4a77-9eab-cfbac5f341cf`; version truoc deploy `e8c5fe1b-a51c-4ce9-bdd8-89239dba0738` de rollback code neu can. Khong rollback D1/R2.
- XLSX template writer duoc nap bang dynamic import sau auth, tranh nap PDF/font library o cac request khong can. Business test download XLSX van dat.
- Rerun truoc deploy: 81/81 tests, TypeScript, targeted lint va build dat. `npm run test:production` sau deploy dat 16/16 (them GET/POST route import); 20/20 request trang auth bo sung dat.
- Hash JS admin, JS client dashboard va CSS tren domain khop ban build; HTML login tham chieu CSS moi. Khong gap trang loi Worker resource limits trong cac request da thu; day khong phai load test.
- Wrangler xac nhan dung account va deploy thanh cong. Token khong co quyen truy van schema D1 truc tiep (7403), nen chua kiem tra lai schema bang CLI; cac migration hien co da duoc ghi nhan o lich su phat hanh truoc. Khong chay migration hay sua du lieu production trong luot nay.
- Chua test co session that/import/thanh toan/gui email tren production. Khong dong nhat smoke test voi doi soat nghiep vu bang workbook that.
- Source van la working tree tren `1ef3e416182814bc16c75ecef3d752c337084e2a`, chua push. Build server entry SHA256 `a81d5dae5a6e57b82b317847215f054b6d94746102b38e5cc934d6e90e59232d`.

## Chay Tiep O May Khac

1. Dong bo code va doc file nay cung `IMPLEMENTATION_LOG.md`, `STAGING.md`. Phien nay chua push; can commit/push cac thay doi truoc khi may khac co the pull.
2. Node >=22.13, `npm ci`, `npm test`, TypeScript va `npm run build`.
3. Khong co migration moi. Database phai co cac migration hien hanh den 0013, dac biet 0010/0011/0012 cho line items, payment status va royalty rules.
4. Local app: `node node_modules/vite/bin/vite.js --host=127.0.0.1 --port=3213 --strictPort`. Neu cong bi chiem, dung cong khac. Secrets local luu trong file ignored, khong dua len Git.
5. Preview component de chay browser tests: `node node_modules/vite/bin/vite.js --config tests/browser/vite.config.mjs`. Dat PLAYWRIGHT_MODULE theo duong dan Playwright tren may; xem `tests/browser/README.md`.
6. Ban nay da deploy; truoc lan deploy tiep theo, kiem tra staging va du lieu doi soat. Chi deploy Cloudflare theo `wrangler.cloudflare.jsonc`. Khong deploy ChatGPT Sites, khong thay DNS.

## Chua Thuc Hien / Viec Tiep Theo

- Commit/push source va tai lieu cua ban da deploy; hien tai van la working tree local, may khac chua pull duoc release nay.
- Kiem tra staging voi workbook that cua truong hop lech quy va doi chieu 2-3 quy co unpaid/paid/GM truoc production; dung chung tu de kiem tra so tien lich su.
- Khac phuc Resend API key/cau hinh staging va kiem tra gui reminder that theo checklist truoc day; khong gui email that trong dot nay.
- Loi upload 2026-09-29: da bo han che namespace-prefixed OOXML va co test, nhung chua co dung workbook gap loi de ket luan day la nguyen nhan duy nhat.
- Cac insight client khac van con LIMIT 5.000 line items / 2.000 breakdowns; dot nay chi sua aggregate chart thang. Can endpoint/pagination/aggregate day du cho tat ca dimension neu tap du lieu lon.
- Khoa/serialize cac thao tac import, rollback, payment theo client; import statement all-or-nothing cho file lon; doi soat GM khi nhap cac quy khong theo thu tu. Import ty le da co transaction/snapshot check, khong nham voi import doanh thu cu.
- Chua them danh muc master song tach rieng, tu chia mot dong doanh thu cho nhieu nguoi, payment mot phan, opening adjustment ngoai he thong hay API ngan hang. Neu can cac nghiep vu nay, can chot quy tac rieng.
