declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAILS?: string;
    AUTH_PROVIDER?: string;
    DB: D1Database;
    FILES: R2Bucket;
  }
}
