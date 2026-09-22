declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAILS?: string;
    APP_BASE_URL?: string;
    AUTH_PROVIDER?: string;
    DEPLOYMENT_ENV?: string;
    DB: D1Database;
    EMAIL_FROM?: string;
    FILES: R2Bucket;
    RESEND_API_KEY?: string;
    SUPER_ADMIN_EMAILS?: string;
    SUPER_ADMIN_PASSWORD?: string;
  }
}

declare module '*.ttf?inline' {
  const dataUrl: string;
  export default dataUrl;
}
