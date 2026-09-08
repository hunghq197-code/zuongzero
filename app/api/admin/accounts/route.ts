import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getAdminAccess,
  getConfiguredSuperAdminEmails,
} from '@/lib/admin-auth';
import { clients } from '@/lib/dashboard-data';
import {
  accountUserIdForEmail,
  cleanText,
  isValidEmail,
  LOCAL_PREVIEW_DOMAIN,
  normalizeEmail,
} from '@/lib/identity';
import { ensureUserRecord, type AppUserRole } from '@/lib/user-records';

type ManagedAccountRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: AppUserRole;
  status: 'active' | 'disabled';
  createdAt: string;
  lastSeenAt: string | null;
  clientId: string | null;
  clientName: string | null;
  accessLevel: ClientAccessLevel | null;
};

type CreateAccountBody = {
  accessLevel?: unknown;
  clientId?: unknown;
  displayName?: unknown;
  email?: unknown;
  role?: unknown;
};

type ManagedAccountRole = 'admin' | 'client';
type ClientAccessLevel = 'owner' | 'viewer' | 'finance';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    if (
      normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
    ) {
      return Response.json({
        accounts: [],
        message: 'Preview chưa có D1. Production sẽ hiển thị tài khoản thật.',
      });
    }

    return jsonError('D1 chưa sẵn sàng để đọc danh sách tài khoản.', 503);
  }

  await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: new Date().toISOString(),
    role: 'super_admin',
    userId: authorization.user.userId,
  });

  return Response.json({
    accounts: await listManagedAccounts(env.DB),
    message: 'Loaded',
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để tạo tài khoản.', 503);
  }

  let body: CreateAccountBody;
  try {
    body = (await request.json()) as CreateAccountBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  const email = normalizeEmail(cleanText(body.email, 254));
  if (!isValidEmail(email)) {
    return jsonError('Email tài khoản không hợp lệ.', 400);
  }

  if (getConfiguredSuperAdminEmails().includes(email)) {
    return jsonError(
      'Tài khoản super admin gốc được quản lý bằng cấu hình server, không chỉnh trong form này.',
      400,
    );
  }

  const role = parseManagedAccountRole(body.role);
  if (!role) {
    return jsonError('Role tài khoản không hợp lệ.', 400);
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: 'super_admin',
    userId: authorization.user.userId,
  });
  const target = await ensureUserRecord(env.DB, {
    displayName: cleanText(body.displayName, 160) || null,
    email,
    lastSeenAt: null,
    role,
    userId: accountUserIdForEmail(email),
  });

  if (target.role === 'super_admin') {
    return jsonError(
      'Không thể chỉnh quyền của tài khoản super admin bằng form tạo tài khoản.',
      409,
    );
  }

  if (role === 'client') {
    const client = clients.find(
      (item) => item.id === cleanText(body.clientId, 120),
    );
    if (!client) {
      return jsonError('Cần chọn khách hàng hợp lệ cho tài khoản client.', 400);
    }

    const accessLevel = parseClientAccessLevel(body.accessLevel);
    if (!accessLevel) {
      return jsonError('Quyền xem dashboard của khách hàng không hợp lệ.', 400);
    }

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO clients (
           id,
           code,
           legal_name,
           display_name,
           default_currency,
           status,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, 'USD', 'active', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           legal_name = excluded.legal_name,
           display_name = excluded.display_name,
           status = 'active',
           updated_at = excluded.updated_at`,
      ).bind(client.id, client.code, client.legalName, client.name, now, now),
      env.DB.prepare(
        `INSERT INTO client_users (
           id,
           client_id,
           user_id,
           access_level,
           status,
           created_at
         )
         VALUES (?, ?, ?, ?, 'active', ?)
         ON CONFLICT(client_id, user_id) DO UPDATE SET
           access_level = excluded.access_level,
           status = 'active'`,
      ).bind(crypto.randomUUID(), client.id, target.id, accessLevel, now),
      createAuditLog(
        actor.id,
        client.id,
        'managed_account_created',
        'user',
        target.id,
        {
          accessLevel,
          email,
          role,
        },
        now,
      ),
    ]);

    return Response.json({
      account: {
        accessLevel,
        clientId: client.id,
        clientName: client.name,
        email,
        role,
      },
      accounts: await listManagedAccounts(env.DB),
      message: `Đã cấp quyền ${accessLevel} cho ${email} tại ${client.name}.`,
    });
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE client_users
       SET status = 'disabled'
       WHERE user_id = ?`,
    ).bind(target.id),
    createAuditLog(
      actor.id,
      null,
      'managed_account_created',
      'user',
      target.id,
      {
        email,
        role,
      },
      now,
    ),
  ]);

  return Response.json({
    account: {
      email,
      role,
    },
    accounts: await listManagedAccounts(env.DB),
    message: `Đã tạo tài khoản quản lý cho ${email}.`,
  });
}

async function authorizeSuperAdmin() {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      ok: false as const,
      message: 'Bạn cần đăng nhập trước khi quản lý tài khoản.',
      status: 401,
    };
  }

  const access = await getAdminAccess(user.email);
  if (!access.allowed) {
    return {
      ok: false as const,
      message: access.reason,
      status: access.status,
    };
  }

  if (access.role !== 'super_admin') {
    return {
      ok: false as const,
      message: 'Chỉ super admin được tạo hoặc xem tài khoản hệ thống.',
      status: 403,
    };
  }

  return {
    ok: true as const,
    user,
  };
}

async function listManagedAccounts(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT
         u.id,
         u.email,
         u.display_name AS displayName,
         u.role,
         u.status,
         u.created_at AS createdAt,
         u.last_seen_at AS lastSeenAt,
         cu.client_id AS clientId,
         c.display_name AS clientName,
         cu.access_level AS accessLevel
       FROM users u
       LEFT JOIN client_users cu
         ON cu.user_id = u.id
        AND cu.status = 'active'
       LEFT JOIN clients c
         ON c.id = cu.client_id
       WHERE u.role IN ('super_admin', 'admin', 'client', 'auditor')
       ORDER BY u.created_at DESC
       LIMIT 100`,
    )
    .all<ManagedAccountRow>();

  return rows.results;
}

function createAuditLog(
  actorUserId: string,
  clientId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
) {
  return env.DB.prepare(
    `INSERT INTO audit_logs (
       id,
       actor_user_id,
       client_id,
       action,
       target_type,
       target_id,
       metadata,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    actorUserId,
    clientId,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata),
    now,
  );
}

function parseManagedAccountRole(value: unknown): ManagedAccountRole | null {
  if (value === 'admin' || value === 'client') return value;
  return null;
}

function parseClientAccessLevel(value: unknown): ClientAccessLevel | null {
  if (value === 'owner' || value === 'viewer' || value === 'finance') {
    return value;
  }

  return null;
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
