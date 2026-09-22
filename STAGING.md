# Môi trường staging

- URL: `https://royalty-dashboard-staging.hung-hq197.workers.dev`
- Worker: `royalty-dashboard-staging`
- D1: `royalty-dashboard-staging-db` (database ID trong `wrangler.cloudflare.jsonc`)
- R2: `royalty-dashboard-staging-files`
- Không có cron nhắc đối soát, không có dữ liệu hay secrets production.

## Thiết lập đăng nhập

Để dùng form đăng nhập và OTP, staging cần bốn secrets riêng. Chạy lại lệnh tương ứng nếu cần thay đổi giá trị; không ghi mật khẩu hoặc API key vào repo hay terminal history:

```powershell
npx wrangler secret put SUPER_ADMIN_EMAILS --config wrangler.cloudflare.jsonc --env staging
npx wrangler secret put SUPER_ADMIN_PASSWORD --config wrangler.cloudflare.jsonc --env staging
npx wrangler secret put EMAIL_FROM --config wrangler.cloudflare.jsonc --env staging
npx wrangler secret put RESEND_API_KEY --config wrangler.cloudflare.jsonc --env staging
```

Dùng mật khẩu staging khác production. `EMAIL_FROM` phải thuộc domain đã xác minh trong Resend; chỉ gửi OTP tới email thử nghiệm của mình. Secrets staging không kế thừa production. Sau khi thiết lập, đăng nhập bằng email super admin staging và mật khẩu staging. Không tắt OTP để thử nghiệm.

## Kiểm tra và deploy

```powershell
npm test
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc --env staging
npm run deploy:staging
npm run test:staging
```

`npm run test:staging` chỉ kiểm tra trang công khai và API từ chối truy cập khi chưa đăng nhập. Trước khi triển khai thay đổi lên production, dùng dữ liệu giả trên staging để kiểm tra xem trước, nhập, bổ sung/thay file, lịch sử và hoàn tác. Không sao chép D1, R2 hoặc secrets production sang staging.
