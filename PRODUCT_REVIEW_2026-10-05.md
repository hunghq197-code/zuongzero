# Đánh giá và tối ưu sản phẩm

Ngày: 05/10/2026. Trạng thái: bản dọn giao diện và giới hạn xác thực **DEPLOYED PRODUCTION**. Kết quả phát hành mới nhất ở cuối tài liệu.

Đã chỉnh source, kiểm tra local và deploy lên https://artistportal.zuongzeroent.com. Không sửa dữ liệu khách hàng, cấu hình email hay secret của Worker. Đợt giới hạn xác thực có thêm bảng bộ đếm D1 và request kiểm tra bằng email giả. Kiểm tra production không phải xác nhận toàn bộ luồng có đăng nhập; xem phạm vi cụ thể ở cuối tài liệu.

## Đã hoàn thành

- Gỡ mô tả giới thiệu, nhãn tiếng Anh và chỉ dẫn lặp lại trên đăng nhập, quên mật khẩu, kích hoạt và đặt lại mật khẩu. Rút gọn nhãn/thông báo trong quản trị.
- Giữ thông báo lỗi, kết quả thao tác, trạng thái dữ liệu, cảnh báo nhập/xóa và thông tin thanh toán. Không xóa ghi chú nghiệp vụ do người dùng nhập, chẳng hạn ghi chú GM.
- Việt hóa thêm vai trò, trạng thái tài khoản, báo cáo, GM, nhắc lịch và cấu hình email. Giá trị enum/API không thay đổi.
- Email và nhắc lịch chỉ được tải khi mở tab tương ứng. Lỗi tải email không còn làm thất bại việc tải tổng quan. Hủy request đọc khi rời tab hoặc đổi quý để tránh ghi kết quả cũ.
- Đặt lại phân trang khi đổi bộ lọc hoặc quý; danh sách mã bài hát không còn bị cắt cứng ở 10 bài mà có phân trang.
- Sửa chiều cao thanh tab admin khi xuống dòng và kích thước cột khu vực báo cáo/tài khoản/GM/email trên mobile. Bảng rộng cuộn trong vùng riêng, không kéo rộng cả trang.
- Hiển thị ngày quản trị theo múi giờ `Asia/Bangkok` (UTC+7).
- Sửa nhánh nhận danh tính qua header: với `AUTH_PROVIDER=app-session`, chỉ phiên hợp lệ mới xác thực người dùng; header OAI/Cloudflare Access do request gửi không được dùng làm danh tính dự phòng. Các provider cũ vẫn được phân biệt rõ để giữ tương thích môi trường preview.
- Trang xác nhận OTP không còn hiển thị form xác nhận cho challenge hết hạn.

## Phương án nên triển khai tiếp

### 1. Ưu tiên: số liệu đầy đủ khi dữ liệu lớn

`lib/client-dashboard-data.ts` đang giới hạn truy vấn tổng cộng 2.000 breakdown và 5.000 dòng chi tiết cho khách hàng, không riêng từng quý. Biểu đồ/insight dựng từ phần dữ liệu này có thể thiếu ở các quý cũ hoặc file lớn; tổng số liệu statement được lưu riêng không đồng nghĩa mọi biểu đồ đều đủ.

Phương án: tải dữ liệu theo quý đang chọn, tính các nhóm biểu đồ bằng SQL trên toàn bộ dòng của quý, và phân trang riêng bảng chi tiết. Chỉ thêm index sau khi kiểm tra truy vấn thực tế. Không bỏ giới hạn để tải tất cả vào Worker, tránh tăng CPU/bộ nhớ và tái diễn lỗi tài nguyên.

Tiêu chí nghiệm thu: nhập file hơn 5.000 dòng ở nhiều quý, đối chiếu tổng theo bài hát/nghệ sĩ/nền tảng với Excel; biểu đồ phải bằng tổng đầy đủ, không phải tổng của một trang.

Tài liệu: [Cloudflare D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).

### 2. Ưu tiên: bảo vệ đăng nhập và email

Bản production cũ `75fa7fdb-85ed-48a4-a560-4c31a5fb027e` chưa có giới hạn request xác thực ở cấp ứng dụng. Bản mới `e8c5fe1b-a51c-4ce9-bdd8-89239dba0738` đã bổ sung giới hạn dùng D1, kiểm thử local và xác nhận ngưỡng theo email trên production như phần bên dưới. Chưa kiểm chứng các rule Cloudflare ngoài source.

Phương án: giới hạn theo IP và tài khoản cho đăng nhập/quên mật khẩu, thêm thời gian chờ gửi lại mã, giữ thông báo chung để không tiết lộ email có tồn tại. Không bỏ OTP để làm nhanh hơn. Không ghi mật khẩu, token hay mã OTP vào log.

Hai super admin hiện dùng chung `SUPER_ADMIN_PASSWORD`. Nên chuyển từng tài khoản sang credential riêng được hash, có kế hoạch bootstrap/khôi phục trước khi bỏ secret dùng chung. Không tự chuyển trong đợt dọn giao diện vì có thể khóa quyền quản trị.

Tiêu chí nghiệm thu: thử vượt ngưỡng, xác nhận không gửi email hàng loạt, OTP hết hạn/dùng lại bị từ chối và tài khoản hợp lệ có thể đăng nhập sau thời gian chờ.

Tài liệu: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### 3. Tiếp theo: quản trị ít thao tác hơn

Gom hồ sơ, tài khoản, báo cáo và tỷ lệ chia vào trang chi tiết từng khách hàng. Giữ tổng quan admin để so sánh toàn hệ thống; Email/Tài khoản có thể nằm trong khu vực cài đặt cho người có quyền phù hợp. Trên mobile nên dùng bộ chọn mục thay vì nhiều hàng tab.

Không thêm quy trình thanh toán phức tạp: tiếp tục hai trạng thái chưa thanh toán/đã thanh toán, giữ người cập nhật và ngày cập nhật. Giữ xác nhận cho xóa/ghi đè và kiểm tra trước khi nhập. Không gộp các quyền hoặc thay đổi phạm vi dữ liệu chỉ để đơn giản hóa giao diện.

Nên tách tài nguyên không phụ thuộc quý (khách hàng, tài khoản, GM) khỏi dữ liệu tổng quan/báo cáo khi đổi quý để giảm request lặp lại. Khi tối ưu cache, phải gắn với phiên/quyền và vô hiệu hóa sau cập nhật; không cache chung dữ liệu riêng của khách hàng.

### 4. Vận hành: kiểm tra khả năng khôi phục

Thử khôi phục D1 và file/snapshot R2 bằng dữ liệu thử nghiệm, không thao tác trên khách hàng thật. Có lịch sử hoàn tác import không thay thế hoàn toàn kế hoạch khôi phục database và file. D1 Time Travel có thời hạn khôi phục phụ thuộc gói; cần kiểm tra gói và giữ bản sao file ngoài cửa sổ đó nếu nghiệp vụ yêu cầu.

Tài liệu: [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Kiểm chứng bản local

- `npm test`: 34 unit tests và 14 contract tests đạt.
- TypeScript không có lỗi; targeted lint và build đạt.
- Playwright kiểm tra tải tab theo nhu cầu, lỗi email không ảnh hưởng tổng quan, phân trang đặt lại khi thay đổi bộ lọc, xem đủ 35 bài hát qua phân trang và dashboard desktop/mobile. Cách chạy lại ở `tests/browser/README.md`.
- Build còn cảnh báo chunk lớn hơn 500 KB; kiểm tra lint có phạm vi, không khẳng định toàn repo sạch lint. Không nâng thư viện hoặc tăng giới hạn tài nguyên chỉ để bỏ cảnh báo.
- Dữ liệu admin trong kiểm thử trình duyệt là mock, không phải dữ liệu khách hàng thật. Không kiểm thử gửi email, thanh toán, import/rollback trên production trong lượt này.
- Ảnh kiểm tra local nằm trong `outputs/product-review-2026-10-05/` (thư mục bị Git ignore).

## Quy trình phát hành

1. Duyệt bản local và ưu tiên phát hành sửa nhánh xác thực cùng các chỉnh UX đã kiểm tra.
2. Smoke test trên môi trường thử nghiệm, có phiên admin và khách hàng thật: đổi quý, mở tab, tải báo cáo, đăng xuất, OTP hết hạn và API từ chối khi chưa đăng nhập.
3. Sau khi được xác nhận mới deploy production; theo dõi Worker Logs, giữ phương án rollback code, không rollback D1/R2 chỉ vì lỗi giao diện.

## Lần thử deploy theo xác nhận 05/10/2026

Lần đầu bị chặn bởi phiên Wrangler hết hạn (`Failed to fetch auth token: 400 Bad Request`) và OAuth callback chưa hoàn tất. Đã chuyển sang xác nhận thiết bị bằng `npx --yes wrangler@4.147.0 login --device`, sử dụng đúng URL `/oauth2/device/verify` do CLI cung cấp. Người dùng tự xác nhận trong trình duyệt, CLI báo `Successfully logged in`; `whoami` của Wrangler 4.92.0 trong dự án cũng xác nhận đúng tài khoản. Không thay đổi dependency hoặc lưu token/mã xác nhận trong repo.

## Kết quả deploy production 05/10/2026

- Lệnh: `npx wrangler deploy --config wrangler.cloudflare.jsonc --env= --keep-vars`.
- Worker: `royalty-dashboard`; phiên bản mới: `75fa7fdb-85ed-48a4-a560-4c31a5fb027e`.
- Domain chính: https://artistportal.zuongzeroent.com; URL Worker: https://royalty-dashboard.hung-hq197.workers.dev.
- Phiên bản trước khi deploy, dùng để khôi phục code nếu cần: `7b02b4dc-3813-4b0b-a7ba-a38730765c57`.
- Nền source: HEAD `1af779c` cùng các thay đổi local của đợt tối ưu; chưa có commit mới. Không deploy staging, chạy migration, sửa D1/R2 hoặc cập nhật secret. Dùng `--keep-vars` để giữ biến cấu hình hiện có.
- `npm run test:production`: đạt 14/14 trên domain chính. Ba trang auth trả 200; API riêng tư trả 401 khi không có phiên, kể cả request giả mạo header danh tính OAI/Cloudflare Access.
- `node tests/production-smoke.mjs https://royalty-dashboard.hung-hq197.workers.dev`: đạt 14/14; URL Worker không cho phép bỏ qua xác thực.
- Thêm 20 request liên tiếp trên domain chính: `/` và `/admin` trả 307 khi chưa đăng nhập; `/login`, `/forgot-password`, `/login/verify` trả 200. Không gặp 5xx/1102 trong lượt kiểm tra này.
- Chưa test lại luồng có phiên admin/client thật, gửi OTP/email, import/rollback hoặc tải báo cáo có dữ liệu trên production. Kết quả trên không thay thế kiểm thử nghiệp vụ và không đảm bảo lỗi tài nguyên không thể tái diễn.

## Bổ sung giới hạn xác thực: demo local 05/10/2026

Trạng thái tại thời điểm hoàn tất demo: **CODE DONE, LOCAL TESTED**. Phần này ban đầu chưa deploy; sau đó người dùng xác nhận "deploy và commit lên github". Kết quả production ở mục phát hành bên dưới.

### Phạm vi đã làm

- Bộ đếm D1 dùng khóa hash của loại thao tác và IP/email, không lưu email/IP trực tiếp trong bảng bộ đếm. Chỉ đọc `CF-Connecting-IP` hợp lệ; không tin `X-Forwarded-For` hoặc `X-Real-IP`. Nếu không có IP hợp lệ, dùng nhóm `unknown` chung để không bỏ qua giới hạn.
- Kiểm tra quota trước xác thực mật khẩu hoặc gửi email. D1 UPSERT có điều kiện để nhiều Worker/request đồng thời không vượt số lượt cho phép. Request bị chặn không kéo dài thời hạn; hết hạn tự được thử lại. Dọn tối đa 100 khóa hết hạn mỗi lần.
- OTP tối đa 5 lượt xác nhận/challenge, đếm bằng UPDATE có điều kiện thay vì đọc rồi ghi. OTP hết hạn/đã dùng bị từ chối; xác nhận đồng thời chỉ tạo một phiên.
- Login/verify trả HTTP 429 và `Retry-After` khi vượt ngưỡng, chuyển về thông báo chờ tiếng Việt. Không thêm note tĩnh, CAPTCHA hoặc bước xác thực mới.
- Quên mật khẩu vẫn trả thông báo chung giống nhau cho email tồn tại, không tồn tại và vượt quota. Không trả chi tiết quota để lộ trạng thái tài khoản.
- Nếu bảng bộ đếm thiếu hoặc D1 lỗi, không tiếp tục gửi email/tạo phiên. Login/verify trả 503; recovery vẫn phản hồi chung. Không vô hiệu hóa OTP, cookie hoặc phân quyền.

| Thao tác | Giới hạn |
| --- | --- |
| Thử đăng nhập theo IP | 60 lượt / 15 phút |
| Thử đăng nhập theo email, gồm cả super admin | 10 lượt / 15 phút |
| Gửi OTP theo IP | 30 lượt / 15 phút |
| Gửi lại OTP theo email | Chờ 60 giây; tối đa 10 lượt / giờ |
| Quên mật khẩu theo IP | 20 lượt / 15 phút |
| Quên mật khẩu theo email | Chờ 60 giây; tối đa 3 lượt / giờ |
| Xác nhận OTP theo IP | 60 lượt / 15 phút, thêm tối đa 5 lượt / challenge |

Giới hạn email là tạm thời, không khóa vĩnh viễn tài khoản. Khi có nhiều người chung IP hoặc một email bị thử liên tục, có thể phải chờ hết cửa sổ. Giới hạn ứng dụng không thay thế kiểm soát lưu lượng tại Cloudflare. Chưa thay cơ chế mật khẩu dùng chung của hai super admin.

### Kiểm thử và dữ liệu

- `npm test`: đạt 35 unit + 15 contract + 18 integration = 68/68.
- Integration chạy các route thật trong Miniflare/workerd, database D1 riêng không lưu bền; mock toàn bộ dịch vụ email, không gọi Resend thật. Kiểm tra đồng thời, hết thời gian chờ, quota IP/email, pending activation, super admin, OTP dùng lại/hết hạn và thiếu migration.
- TypeScript, targeted lint và production build đạt. Build còn cảnh báo chunk lớn có sẵn.
- Playwright đạt 7/7 trên ứng dụng local: thông báo login/verify/dịch vụ tạm ngưng ở desktop/mobile, và submit form thật sau 10 lượt thử với email giả chưa có tài khoản. Không gửi email thật hoặc tạo tài khoản demo trong database ứng dụng.
- Demo đang chạy ở `http://127.0.0.1:3213/login`. Cổng 3211 còn PID đăng ký với vinext nhưng không có listener lúc kiểm tra; không dừng tiến trình đó.
- Chỉ áp dụng `0008_login_otps.sql` (demo đang thiếu bảng OTP) và `0013_auth_rate_limits.sql` lên D1 **local** `site-creator-d1`. Đây là các lệnh CREATE TABLE/INDEX, không sửa dữ liệu tài khoản/báo cáo. Không chạy migration remote hoặc sửa secret.
- Ảnh Playwright ở `outputs/auth-demo-2026-10-05/`, cấu hình migration demo ở `outputs/wrangler.auth-local.jsonc`; thư mục bị Git ignore.

### Trước khi phát hành

1. Duyệt demo. Áp dụng `drizzle/0013_auth_rate_limits.sql` lên D1 của môi trường định phát hành trước khi deploy code; kiểm tra bảng/index. Không chạy lại migration OTP nếu môi trường đã có bảng.
2. Các migration 0010-0013 theo cơ chế SQL thủ công hiện có. Không dùng `drizzle-kit generate` để tự tái tạo các thay đổi cũ từ snapshot chưa cập nhật.
3. Chỉ deploy production sau xác nhận riêng. Kiểm thử lại OTP/email thật bằng tài khoản thử được cho phép và kiểm tra log/quota. Không thử gửi hàng loạt trên khách hàng thật.
4. Nếu phải rollback code, giữ bảng bộ đếm; không xóa/rollback dữ liệu D1/R2. Tối ưu truy vấn biểu đồ theo toàn quý và credential riêng cho super admin vẫn là việc tiếp theo.

## Phát hành giới hạn xác thực lên production 05/10/2026

- Người dùng xác nhận deploy và commit lên GitHub, sau đó yêu cầu tiếp tục tác vụ. `git fetch origin` xác nhận `main` và `origin/main` cùng ở `1af779c`, không có thay đổi remote cần gộp.
- Wrangler xác nhận đúng account. Đọc schema D1 production xác nhận bảng OTP đã có và bảng bộ đếm chưa có. Chỉ áp dụng `drizzle/0013_auth_rate_limits.sql` lên `royalty-dashboard-db` bằng `d1 execute --remote --config wrangler.cloudflare.jsonc --env= --file ...`, sau đó xác nhận bảng/index. Không chạy lại 0008 hoặc các migration cũ.
- `npm test` chạy lại đạt 68/68; TypeScript, targeted lint và build đạt. Không phát sinh thay đổi source sau build ngoài tài liệu.
- Deploy: `npx wrangler deploy --config wrangler.cloudflare.jsonc --env= --keep-vars`.
- Worker: `royalty-dashboard`; version: `e8c5fe1b-a51c-4ce9-bdd8-89239dba0738`; domain: https://artistportal.zuongzeroent.com.
- Version trước phát hành dùng để rollback code: `75fa7fdb-85ed-48a4-a560-4c31a5fb027e`. Không xóa bảng bộ đếm khi rollback code.
- Giữ vars/secrets, binding R2 và cron `0 2 15 * *`. Không deploy staging; không thay đổi tài khoản, báo cáo hoặc file của khách hàng.
- `npm run test:production` đạt 14/14 trên domain chính; smoke test URL Worker đạt 14/14. Trang auth trả 200, API riêng tư trả 401 khi không có phiên, kể cả header danh tính giả.
- Kiểm tra login limiter trên domain chính bằng một email giả ngẫu nhiên thuộc `example.invalid`, không có tài khoản: 10 request đầu trả lỗi đăng nhập HTTP 200 theo luồng hiện có; request 11 trả HTTP 429, `Retry-After` hợp lệ và `error=rate_limited`. Không request nào đặt session cookie. Chỉ phát sinh bucket đếm tạm thời, không tạo user/challenge hoặc gửi email thật.
- Chưa kiểm thử lại OTP/email thật hoặc luồng dashboard có phiên admin/client trên production. Các quota khác và concurrency được kiểm tra trong integration D1 riêng. Không coi smoke test là kiểm thử toàn bộ nghiệp vụ.
- Source phát hành gồm baseline `1af779c`, các thay đổi dọn giao diện trước đó và giới hạn xác thực vừa hoàn thiện; commit code và bản ghi GitHub được ghi ở nhật ký triển khai sau bước commit.
