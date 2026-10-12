# An Toan Du Lieu Va Bao Cao - 12/10/2026

Trang thai: DEPLOYED PRODUCTION version `3c514f56-93bb-487c-b4d1-fb2b91519456`. Source goc `c339b8c` tren `main`; thong tin commit source o muc phat hanh ben duoi.
Nguoi dung yeu cau trien khai cac muc con thieu va giu cach dung don gian nhat.
Giai doan local ban dau khong deploy/commit/push. Sau do nguoi dung xac nhan phat hanh va commit; da deploy va them bang khoa production, khong thay secret hay sua du lieu khach hang. Ket qua phat hanh o cuoi file.

## Nguyen Tac Don Gian

- Giu nguyen cac tab, nut va form hien co. Khong them quy trinh duyet, hang doi, thanh toan mot phan hay ket noi ngan hang.
- Moi khach hang chi co mot thao tac ghi tai mot thoi diem. Thao tac xung dot tra 409 va thong bao thu lai, khong cho request cu ghi de request moi.
- Khong tu tinh lai lich su GM da co. Khi khach hang co GM va statement o quy sau, nhap/sua/xoa/hoan tac quy truoc bi chan. Xu ly du lieu tu quy moi nhat truoc, sau do nhap lai theo thu tu thoi gian.
- Su dung trang Tai khoan, Quen mat khau va OTP hien co cho super admin; khong tao them man hinh.

## Da Lam

### 1. Khoa Ghi Theo Khach Hang

- Them `client_write_locks` va migration `drizzle/0014_client_write_locks.sql`.
- D1 cap lease 120 giay bang UPSERT co dieu kien; khoa nhieu khach hang theo cung scope cho bulk import. Neu mot khach hang dang ban, thu hoi cac khoa vua lay va khong nhap mot phan file.
- Moi batch tai chinh kiem tra owner va thoi han ngay trong transaction. Request het lease khong duoc ghi; finally chi mo khoa cua dung owner, khong xoa khoa moi cua request khac.
- Ap dung cho upload/preview/commit, payment/status/delete statement, rollback, tao/cap nhat GM, CRUD/import ty le chia va sua/archive/delete khach hang.
- Doc du lieu khong bi khoa. Khach hang khac van thao tac duoc. Neu bang khoa chua co, API ghi tu choi 503; khong tu tat bao ve.
- Scoped DB chi fence `batch`; cac mutation tai chinh trong scope deu dung batch. Khong coi API `prepare().run()` la duong ghi tai chinh duoc bao ve.

### 2. Import Va Hoan Tac D1 Khong Ghi Do Dang

- Thay commit theo nhieu batch bang mot D1 batch cho toan file, gom report, totals, breakdown, line items, GM va audit.
- Line items/breakdown/recoupment duoc nap bang JSON arrays theo khoi <=512 KiB de giam so statement/parameters. Khong ghep gia tri Excel vao SQL, khong doi gia tri goc.
- Rollback restore va trang thai upload/audit cung mot transaction. Neu bat ky cau lenh nao loi, D1 giu nguyen trang thai truoc do.
- Xoa khach hang chi xoa workbook sau khi D1 thanh cong; bo sung xoa rule cua khach hang de khong vi pham FK. Neu don file R2 that bai, log viec don file con lai, khong bao rang du lieu D1 chua xoa.
- R2 va D1 khong co transaction chung. File/snapshot duoc luu truoc commit D1; neu import that bai co the con object khong duoc tham chieu. Khong tu xoa object khi ket qua database chua chac chan. Chua them job don file mo coi.

### 3. Bao Cao Day Du

- Bo LIMIT 2.000 o truy van breakdown da tong hop.
- Khong tai 5.000 dong chi tiet de tinh insights tren browser nua. SQL SUM/COUNT tren toan bo dong cua tung client/quy cho configuration, loai noi dung, hop dong, nghe si phat hanh va ISRC.
- `sourceInsightsByPeriod` nuoi dung cac chart/bang hien co; danh sach ISRC van phan trang 10 dong tren UI. Doi quy doi ca du lieu insight va nhan bao cao.
- Chart thang van dung aggregate SQL da trien khai truoc. Breakdown top/nhom Others cua parser van giu tong cua cac dong con lai, khong phai mat doanh thu.
- Khong gui raw workbook rows vao dashboard. Export chi tiet giu luong va phan quyen cu.
- Van tai cac nhom tong hop cho nhieu quy va gioi han danh sach statement 120 ky nhu truoc; chua them endpoint lazy-load/pagination server cho hang chuc nghin nhom ISRC rieng biet. Da test 5.100 dong va 2.101 nhom breakdown, khong phai load test moi file 15 MB.

### 4. Mat Khau Rieng Cho Super Admin

- Dang nhap uu tien credential rieng cua tai khoan. Khi credential da ton tai, khong fallback sang `SUPER_ADMIN_PASSWORD` neu mat khau rieng sai.
- Tai khoan super admin trong danh sach cau hinh chua co credential duoc bootstrap bang mat khau server hien co sau khi kiem tra dung mat khau. Luu PBKDF2/salt rieng; INSERT ON CONFLICT DO NOTHING va doc lai credential de khong ghi de mat khau vua doi.
- Bootstrap giu cach dang nhap cu, khong dat mat khau moi va khong tu doi secret. Ban dau hai tai khoan van co the dung cung mat khau cu; moi nguoi phai tu doi thanh mat khau rieng trong trang Tai khoan. Khong go secret server truoc khi hai tai khoan da bootstrap/xac nhan khoi phuc.
- Super admin da ton tai va active co the dung Quen mat khau de nhan reset link, ke ca chua bootstrap credential; link reset tao password rieng qua email, khong can biet mat khau server cu. Khong tu tao user/super admin tu request quen mat khau. Tai khoan disabled khong bi bootstrap kich hoat lai va khong nhan recovery.
- Doi/reset mat khau thu hoi OTP cu, reset link cu va cac session khac (reset thu hoi tat ca session). Reset link va password mutation kiem tra lai dieu kien trong transaction; cung link khong reset duoc hai lan dong thoi.
- Verify OTP kiem tra lai status/expiry/user active trong transaction tao session de chan OTP bi thu hoi trong luc dang xu ly.
- OTP va gioi han request cu van giu. Khong thay mat khau thuc cua hai super admin trong tac vu nay.

## Kiem Thu

- `npm test`: 95/95 = 35 unit + 17 contract + 22 auth + 21 business.
- D1/R2 business va email auth chay trong Miniflare rieng; outbound email mock, khong goi Resend that. Test identity adapter chi nam trong test bundler.
- File gia 5.101 dong: gay loi bang SQLite trigger giua import va luc ket thuc rollback, xac nhan toan bo D1 khong thay doi; sau khi go trigger import/rollback thanh cong.
- Kiem tra request payment dong thoi chi ghi mot payment event; khoa client A khong chan B; bulk lock that bai khong de lai partial lock; request mat lease khong ghi/xoa khoa cua owner moi; missing migration fail closed.
- Aggregate 5.100 dong, nhieu quy va 2.101 breakdown: tong day du va khong co nhom cua client khac.
- Kiem tra bootstrap hai super admin, hash rieng, server password khong vuot qua password ca nhan, doi password trong form cu, recovery link dung mot lan va disabled account.
- TypeScript va targeted lint dat. Build dat; van co canh bao chunk >500 KB/plugin timings co san.
- Playwright product-ux va royalty-workflow desktop/mobile dat; fixture danh sach bai hat da dung `sourceInsightsByPeriod`. Kiem tra anh khong tran ngang. Anh trong `outputs/` ignored.
- Playwright auth-feedback dat 7/7 tren app local: desktop/mobile va submit form that tra 429 sau khi vuot nguong. Lan dau Chrome loi capture screenshot; chay lai rieng dat. Khong dang nhap/sua tai khoan/email that.

## Local Va Phat Hanh

- Chi apply 0014 len D1 local `site-creator-d1` o `.wrangler/state`, bang config ignored `outputs/wrangler.auth-local.jsonc`. Khong apply remote.
- Demo app: `http://127.0.0.1:3213/login`. Component preview/test cong 3212 khong phai production va duoc dung sau test.
- Truoc deploy: kiem tra D1 dung moi truong da co migrations hien hanh den 0013, apply **chi 0014** neu bang khoa chua co; sau do build, test va deploy theo xac nhan rieng. Khong auto-generate lai cac migration SQL thu cong.
- Khong thao tac ghi khi dang chuyen version; code cu khong tham gia khoa moi. Neu rollback ve code auth cu, no se dung password server thay vi credential rieng: phai chot ke hoach khoi phuc truoc, khong downgrade auth mot cach tu dong.
- Production ghi nhan gan nhat trong tai lieu truoc: version `96f84c58-2cdc-4a77-9eab-cfbac5f341cf`, source `cfdb42d`. Luot nay khong doc lai Cloudflare, khong deploy.
- Can thu workbook that tren staging, dang nhap hai super admin, doi/reset mat khau bang inbox thu nghiem va dien tap khoi phuc D1/R2. Chua thuc hien cac buoc nay tren production.
- Khong them auto-GM-rebuild, master-song rieng, split nhieu nguoi, payment mot phan, opening adjustment hay job ngan hang trong dot nay.

Tai lieu ky thuat: [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Bo Sung: Tong Quan Tai Chinh Client Gon Hon

Theo yeu cau tiep theo ngay 12/10, overview chi con 6 chi so: Tong doanh thu, So du ky truoc, Thuc nhan trong quy, So du ky nay, Da thanh toan, So du chuyen ky sau. Bo panel Thanh toan va Chi tiet cach tinh, khong doi cong thuc, du lieu, GM, export hoac tinh nang admin.

Layout 3 cot desktop / 2 cot tablet / 1 cot mobile; status/quy van o header. Test browser 16/16 cho paid/unpaid/empty/large amounts va workflow doi quy/dat rule dat. Them 1 contract test UI; ket qua npm test/build moi nhat xem `IMPLEMENTATION_LOG.md`. Giai doan demo nay da duoc phat hanh theo xac nhan rieng ben duoi.

## Phat Hanh Production - 12/10/2026

- Nguoi dung xac nhan deploy va commit GitHub. GitHub khong co thay doi moi ngoai `c339b8c`; dung dung account Cloudflare. Khong force push, khong doi DNS.
- Da doc schema D1 production: cac bang den 0013 va UNIQUE index credential user da co; `client_write_locks` chua co. Chi apply 0014 bang Wrangler `d1 execute ... --remote --config wrangler.cloudflare.jsonc --env= --file drizzle/0014_client_write_locks.sql`, xac nhan schema sau khi tao. Khong can migration credential moi.
- Rerun `npm test` 96/96 va build dat. Deploy len `royalty-dashboard` bang `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.cloudflare.jsonc --env= --keep-vars`.
- Version `3c514f56-93bb-487c-b4d1-fb2b91519456`; version cu `96f84c58-2cdc-4a77-9eab-cfbac5f341cf`. Khong rollback D1/R2; rollback code auth cu phai co ke hoach khoi phuc vi khong su dung credential ca nhan.
- Domain chinh `https://artistportal.zuongzeroent.com`; URL Worker `https://royalty-dashboard.hung-hq197.workers.dev`. Vars/secrets, cron va bindings duoc giu; khong deploy staging hoac reset password that.
- Production smoke 16/16 tren ca hai host. Ba assets JS admin/JS dashboard/CSS khop hash ban build; login HTML tham chieu CSS moi. Chua test co phien/du lieu that hay gui email that tren production.
- Build server entry SHA256 `2edd53127d48fefe8e169d67a29f8ce78a3aba8ed2d2b9232d9d8e60ca094eeb`; build tu working tree tren `c339b8c`. Commit source va tai lieu duoc ghi nhan sau buoc commit; cap nhat .md sau commit code khong can deploy lai.
- Moi super admin dung credential rieng neu da co. Dang nhap cu bootstrap mot lan neu chua co; Tai khoan cho phep doi password va Quen mat khau cho phep reset qua inbox cua super admin active da ton tai. Khong tu doi password cua khach hang hay hai super admin khi deploy.
