declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAILS?: string;
    DB: D1Database;
    FILES: R2Bucket;
  }
}
