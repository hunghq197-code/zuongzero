import { env } from 'cloudflare:workers';

import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';

export type AdminRole = 'super_admin' | 'admin';

export type AdminAccess =
  | {
      allowed: true;
      mode: 'super-admin-allowlist' | 'assigned' | 'local-preview';
      role: AdminRole;
    }
  | { allowed: false; reason: string; status: number };

type StoredAdminUser = {
  role: AdminRole;
};

export async function getAdminAccess(email: string): Promise<AdminAccess> {
  const configuredSuperAdmins = getConfiguredSuperAdminEmails();
  const normalizedEmail = normalizeEmail(email);

  if (configuredSuperAdmins.includes(normalizedEmail)) {
    return {
      allowed: true,
      mode: 'super-admin-allowlist',
      role: 'super_admin',
    };
  }

  try {
    if (env.DB) {
      const storedUser = await env.DB.prepare(
        `SELECT role
         FROM users
         WHERE lower(email) = ?
           AND status = 'active'
           AND role IN ('super_admin', 'admin')
         LIMIT 1`,
      )
        .bind(normalizedEmail)
        .first<StoredAdminUser>();

      if (storedUser) {
        return {
          allowed: true,
          mode: 'assigned',
          role: storedUser.role,
        };
      }
    }
  } catch {
    return {
      allowed: false,
      reason: 'Không thể kiểm tra quyền quản trị vì database chưa sẵn sàng.',
      status: 503,
    };
  }

  if (configuredSuperAdmins.length === 0) {
    if (normalizedEmail.endsWith(LOCAL_PREVIEW_DOMAIN)) {
      return {
        allowed: true,
        mode: 'local-preview',
        role: 'super_admin',
      };
    }

    return {
      allowed: false,
      reason:
        'Khu admin đang khóa vì production chưa cấu hình SUPER_ADMIN_EMAILS hoặc ADMIN_EMAILS.',
      status: 503,
    };
  }

  return {
    allowed: false,
    reason:
      'Tài khoản này chưa được super admin cấp quyền quản trị trong hệ thống.',
    status: 403,
  };
}

export function getConfiguredSuperAdminEmails() {
  return [env.SUPER_ADMIN_EMAILS, env.ADMIN_EMAILS]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
