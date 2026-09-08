import { env } from 'cloudflare:workers';

import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { clients } from '@/lib/dashboard-data';

const LOCAL_PREVIEW_DOMAIN = '@sites.test';

export type ClientPortalAccess =
  | {
      allowed: true;
      role: 'admin' | 'client';
      mode: 'assigned' | 'admin' | 'local-preview';
      clientId: string;
      clientName: string;
      accessLevel: 'admin' | 'owner' | 'viewer' | 'finance';
    }
  | {
      allowed: false;
      reason: string;
      status: number;
    };

type ClientAssignment = {
  clientId: string;
  clientName: string;
  accessLevel: 'owner' | 'viewer' | 'finance';
};

export async function getClientPortalAccess(
  user: ChatGPTUser,
): Promise<ClientPortalAccess> {
  const adminAccess = getAdminAccess(user.email);
  if (adminAccess.allowed) {
    return {
      allowed: true,
      role: 'admin',
      mode: 'admin',
      clientId: clients[0].id,
      clientName: clients[0].name,
      accessLevel: 'admin',
    };
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!env.DB) {
    if (normalizedEmail.endsWith(LOCAL_PREVIEW_DOMAIN)) {
      return {
        allowed: true,
        role: 'client',
        mode: 'local-preview',
        clientId: clients[0].id,
        clientName: clients[0].name,
        accessLevel: 'viewer',
      };
    }

    return {
      allowed: false,
      reason:
        'Hệ thống phân quyền khách hàng chưa sẵn sàng. Vui lòng kiểm tra D1 binding trước khi mở production.',
      status: 503,
    };
  }

  const assignment = await env.DB.prepare(
    `SELECT
       c.id AS clientId,
       c.display_name AS clientName,
       cu.access_level AS accessLevel
     FROM client_users cu
     JOIN users u ON u.id = cu.user_id
     JOIN clients c ON c.id = cu.client_id
     WHERE lower(u.email) = ?
       AND cu.status = 'active'
       AND c.status = 'active'
       AND cu.access_level IN ('owner', 'viewer', 'finance')
     LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<ClientAssignment>();

  if (!assignment) {
    return {
      allowed: false,
      reason:
        'Tài khoản này chưa được admin gán vào khách hàng nào. Hãy gửi yêu cầu đăng ký để chờ duyệt.',
      status: 403,
    };
  }

  return {
    allowed: true,
    role: 'client',
    mode: 'assigned',
    clientId: assignment.clientId,
    clientName: assignment.clientName,
    accessLevel: assignment.accessLevel,
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
