import { env } from 'cloudflare:workers';

const LOCAL_PREVIEW_DOMAIN = '@sites.test';

export type AdminAccess =
  | { allowed: true; mode: 'configured' | 'local-preview' }
  | { allowed: false; reason: string; status: number };

export function getAdminAccess(email: string): AdminAccess {
  const configuredAdmins = getConfiguredAdminEmails();
  const normalizedEmail = email.trim().toLowerCase();

  if (configuredAdmins.length === 0) {
    if (normalizedEmail.endsWith(LOCAL_PREVIEW_DOMAIN)) {
      return { allowed: true, mode: 'local-preview' };
    }

    return {
      allowed: false,
      reason: 'Khu admin đang khóa vì production chưa cấu hình ADMIN_EMAILS.',
      status: 503,
    };
  }

  if (!configuredAdmins.includes(normalizedEmail)) {
    return {
      allowed: false,
      reason: 'Tài khoản này chưa nằm trong admin allowlist.',
      status: 403,
    };
  }

  return { allowed: true, mode: 'configured' };
}

export function getConfiguredAdminEmails() {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
