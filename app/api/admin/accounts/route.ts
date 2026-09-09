import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getAdminAccess,
  getConfiguredSuperAdminEmails,
} from '@/lib/admin-auth';
import { createAccountInvite } from '@/lib/account-invites';
import {
  fallbackCustomerRows,
  listManagedCustomers,
} from '@/lib/admin-customers';
import {
  accountInviteDeliveryMessage,
  passwordResetDeliveryMessage,
  sendAccountInviteEmail,
  sendPasswordResetEmail,
} from '@/lib/email';
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
  clientCode?: unknown;
  clientName?: unknown;
  displayName?: unknown;
  email?: unknown;
  role?: unknown;
};

type ResetAccountBody = {
  action?: unknown;
  email?: unknown;
  status?: unknown;
  userId?: unknown;
};

type ManagedAccountRole = 'admin' | 'client';
type ClientAccessLevel = 'owner' | 'viewer' | 'finance';

type NewClientAccount = {
  accessLevel: ClientAccessLevel;
  code: string;
  id: string;
  legalName: string;
  name: string;
};

type ResetTargetRow = {
  clientId: string | null;
  clientName: string | null;
  credentialId: string | null;
  displayName: string | null;
  email: string;
  id: string;
  role: ManagedAccountRole | 'super_admin' | 'auditor' | 'pending';
  status: 'active' | 'disabled';
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return await listAccountsResponse(request);
  } catch (error) {
    return serverErrorResponse(
      error,
      'Không thể tải danh sách tài khoản lúc này.',
    );
  }
}

async function listAccountsResponse(request: Request) {
  const authorization = await authorizeSuperAdmin(request.headers);
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    if (
      normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
    ) {
      return Response.json({
        accounts: [],
        customers: fallbackCustomerRows(),
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
    customers: await listManagedCustomers(env.DB),
    message: 'Loaded',
  });
}

export async function POST(request: Request) {
  try {
    return await createAccountResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tạo tài khoản lúc này.');
  }
}

export async function PATCH(request: Request) {
  try {
    return await updateAccountResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể cập nhật tài khoản này.');
  }
}

async function updateAccountResponse(request: Request) {
  let body: ResetAccountBody;
  try {
    body = (await request.json()) as ResetAccountBody;
  } catch {
    return jsonError('Payload không hợp lệ.', 400);
  }

  if (body.action === 'set_status') {
    return updateAccountStatusResponse(request, body);
  }

  return createAccountResetResponse(request, body);
}

async function createAccountResponse(request: Request) {
  const authorization = await authorizeSuperAdmin(request.headers);
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

  const existingUser = await findUserByEmail(env.DB, email);
  if (existingUser) {
    return jsonError('Email này đã có tài khoản.', 409);
  }

  let client: NewClientAccount | null = null;
  if (role === 'client') {
    const clientName = cleanText(body.clientName, 160);
    if (!clientName) {
      return jsonError('Cần nhập tên khách hàng.', 400);
    }

    const clientCode = normalizeClientCode(body.clientCode);
    if (!clientCode) {
      return jsonError('Cần nhập mã khách hàng hợp lệ.', 400);
    }

    const accessLevel = parseClientAccessLevel(body.accessLevel);
    if (!accessLevel) {
      return jsonError('Quyền xem dashboard của khách hàng không hợp lệ.', 400);
    }

    const clientId = clientIdForCode(clientCode);
    const clientConflict = await findClientByCodeOrId(
      env.DB,
      clientCode,
      clientId,
    );
    if (clientConflict) {
      return jsonError('Mã khách hàng này đã tồn tại.', 409);
    }

    client = {
      accessLevel,
      code: clientCode,
      id: clientId,
      legalName: clientName,
      name: clientName,
    };
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: 'super_admin',
    userId: authorization.user.userId,
  });
  const targetUserId = accountUserIdForEmail(email);
  const targetDisplayName = resolveAccountDisplayName(body, role);

  if (client) {
    await env.DB.batch([
      insertManagedUser(
        targetUserId,
        email,
        targetDisplayName,
        role,
        'disabled',
        now,
      ),
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
         VALUES (?, ?, ?, ?, 'USD', 'active', ?, ?)`,
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
      ).bind(
        crypto.randomUUID(),
        client.id,
        targetUserId,
        client.accessLevel,
        now,
      ),
      createAuditLog(
        actor.id,
        client.id,
        'managed_account_created',
        'user',
        targetUserId,
        {
          accessLevel: client.accessLevel,
          email,
          role,
        },
        now,
      ),
    ]);

    const invite = await createAccountInvite(env.DB, {
      createdByUserId: actor.id,
      email,
      requestUrl: request.url,
      userId: targetUserId,
    });
    const emailDelivery = await sendAccountInviteEmail({
      displayName: targetDisplayName,
      email,
      expiresAt: invite.expiresAt,
      inviteUrl: invite.inviteUrl,
      role,
    });

    return Response.json({
      account: {
        accessLevel: client.accessLevel,
        clientId: client.id,
        clientName: client.name,
        email,
        inviteExpiresAt: invite.expiresAt,
        inviteUrl: invite.inviteUrl,
        role,
      },
      accounts: await listManagedAccounts(env.DB),
      customers: await listManagedCustomers(env.DB),
      message: `Đã tạo khách hàng ${client.name} cho ${email}. ${accountInviteDeliveryMessage(emailDelivery)}`,
    });
  }

  await env.DB.batch([
    insertManagedUser(
      targetUserId,
      email,
      targetDisplayName,
      role,
      'disabled',
      now,
    ),
    env.DB.prepare(
      `UPDATE client_users
       SET status = 'disabled'
       WHERE user_id = ?`,
    ).bind(targetUserId),
    createAuditLog(
      actor.id,
      null,
      'managed_account_created',
      'user',
      targetUserId,
      {
        email,
        role,
      },
      now,
    ),
  ]);

  const invite = await createAccountInvite(env.DB, {
    createdByUserId: actor.id,
    email,
    requestUrl: request.url,
    userId: targetUserId,
  });
  const emailDelivery = await sendAccountInviteEmail({
    displayName: targetDisplayName,
    email,
    expiresAt: invite.expiresAt,
    inviteUrl: invite.inviteUrl,
    role,
  });

  return Response.json({
    account: {
      email,
      inviteExpiresAt: invite.expiresAt,
      inviteUrl: invite.inviteUrl,
      role,
    },
    accounts: await listManagedAccounts(env.DB),
    customers: await listManagedCustomers(env.DB),
    message: `Đã tạo tài khoản quản lý cho ${email}. ${accountInviteDeliveryMessage(emailDelivery)}`,
  });
}

async function createAccountResetResponse(
  request: Request,
  body: ResetAccountBody,
) {
  const authorization = await authorizeSuperAdmin(request.headers);
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để tạo link tài khoản.', 503);
  }

  const targetUserId =
    typeof body.userId === 'string' ? body.userId.trim().slice(0, 160) : '';
  const email = normalizeEmail(cleanText(body.email, 254));
  if (!targetUserId && (!email || !isValidEmail(email))) {
    return jsonError('Cần chọn tài khoản hợp lệ.', 400);
  }

  const target = await findResetTarget(env.DB, {
    email: email || null,
    userId: targetUserId || null,
  });
  if (!target) {
    return jsonError('Không tìm thấy tài khoản.', 404);
  }

  if (target.role !== 'admin' && target.role !== 'client') {
    return jsonError('Không thể tạo link cho tài khoản này.', 400);
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: 'super_admin',
    userId: authorization.user.userId,
  });
  const purpose =
    target.status === 'active' && target.credentialId
      ? 'password_reset'
      : 'account_activation';
  const invite = await createAccountInvite(env.DB, {
    createdByUserId: actor.id,
    email: target.email,
    purpose,
    requestUrl: request.url,
    userId: target.id,
  });

  const delivery =
    purpose === 'password_reset'
      ? await sendPasswordResetEmail({
          displayName: target.displayName,
          email: target.email,
          expiresAt: invite.expiresAt,
          resetUrl: invite.inviteUrl,
        })
      : await sendAccountInviteEmail({
          displayName: target.displayName,
          email: target.email,
          expiresAt: invite.expiresAt,
          inviteUrl: invite.inviteUrl,
          role: target.role,
        });

  await createAuditLog(
    actor.id,
    target.clientId,
    purpose === 'password_reset'
      ? 'password_reset_requested'
      : 'activation_invite_resent',
    'user',
    target.id,
    {
      email: target.email,
      purpose,
    },
    now,
  ).run();

  return Response.json({
    account: {
      email: target.email,
      inviteExpiresAt: invite.expiresAt,
      inviteUrl: invite.inviteUrl,
      purpose,
      role: target.role,
    },
    accounts: await listManagedAccounts(env.DB),
    customers: await listManagedCustomers(env.DB),
    message:
      purpose === 'password_reset'
        ? passwordResetDeliveryMessage(delivery)
        : accountInviteDeliveryMessage(delivery),
  });
}

async function updateAccountStatusResponse(
  request: Request,
  body: ResetAccountBody,
) {
  const authorization = await authorizeSuperAdmin(request.headers);
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để cập nhật tài khoản.', 503);
  }

  const targetUserId =
    typeof body.userId === 'string' ? body.userId.trim().slice(0, 160) : '';
  const status = parseAccountStatus(body.status);
  if (!targetUserId || !status) {
    return jsonError('Cần chọn tài khoản và trạng thái hợp lệ.', 400);
  }

  const target = await findResetTarget(env.DB, {
    email: null,
    userId: targetUserId,
  });
  if (!target) return jsonError('Không tìm thấy tài khoản.', 404);

  if (target.role === 'super_admin') {
    return jsonError('Không thể khoá tài khoản super admin gốc.', 400);
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: 'super_admin',
    userId: authorization.user.userId,
  });
  const statements = [
    env.DB.prepare(
      `UPDATE users
       SET status = ?
       WHERE id = ?`,
    ).bind(status, target.id),
    createAuditLog(
      actor.id,
      target.clientId,
      'managed_account_status_updated',
      'user',
      target.id,
      {
        clientName: target.clientName,
        email: target.email,
        previousStatus: target.status,
        status,
      },
      now,
    ),
  ];

  if (status === 'disabled') {
    statements.push(
      env.DB.prepare(
        `DELETE FROM auth_sessions
         WHERE user_id = ?`,
      ).bind(target.id),
    );
  }

  await env.DB.batch(statements);

  return Response.json({
    accounts: await listManagedAccounts(env.DB),
    customers: await listManagedCustomers(env.DB),
    message:
      status === 'active'
        ? 'Đã mở tài khoản.'
        : 'Đã khoá tài khoản và huỷ session đang đăng nhập.',
  });
}

async function authorizeSuperAdmin(requestHeaders: Headers) {
  const user = await getChatGPTUser(requestHeaders);
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
        AND (
          u.role != 'client'
          OR cu.client_id IS NOT NULL
        )
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

function insertManagedUser(
  userId: string,
  email: string,
  displayName: string | null,
  role: ManagedAccountRole,
  status: 'active' | 'disabled',
  now: string,
) {
  return env.DB.prepare(
    `INSERT INTO users (
       id,
       email,
       display_name,
       role,
       status,
       created_at,
       last_seen_at
     )
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).bind(userId, email, displayName, role, status, now);
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

function parseAccountStatus(value: unknown) {
  if (value === 'active' || value === 'disabled') return value;
  return null;
}

async function findUserByEmail(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT id
       FROM users
       WHERE lower(email) = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<{ id: string }>();
}

async function findResetTarget(
  db: D1Database,
  input: {
    email: string | null;
    userId: string | null;
  },
) {
  const predicate = input.userId ? 'u.id = ?' : 'lower(u.email) = ?';
  const value = input.userId ?? input.email;
  if (!value) return null;

  return db
    .prepare(
      `SELECT
         u.id,
         u.email,
         u.display_name AS displayName,
         u.role,
         u.status,
         pc.id AS credentialId,
         cu.client_id AS clientId,
         c.display_name AS clientName
       FROM users u
       LEFT JOIN password_credentials pc
         ON pc.user_id = u.id
       LEFT JOIN client_users cu
         ON cu.user_id = u.id
        AND cu.status = 'active'
       LEFT JOIN clients c
         ON c.id = cu.client_id
       WHERE ${predicate}
       LIMIT 1`,
    )
    .bind(value)
    .first<ResetTargetRow>();
}

async function findClientByCodeOrId(
  db: D1Database,
  code: string,
  clientId: string,
) {
  return db
    .prepare(
      `SELECT id
       FROM clients
       WHERE upper(code) = ?
          OR id = ?
       LIMIT 1`,
    )
    .bind(code, clientId)
    .first<{ id: string }>();
}

function resolveAccountDisplayName(
  body: CreateAccountBody,
  role: ManagedAccountRole,
) {
  if (role === 'client') return cleanText(body.clientName, 160) || null;
  return cleanText(body.displayName, 160) || null;
}

function normalizeClientCode(value: unknown) {
  return cleanText(value, 48)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function clientIdForCode(code: string) {
  return `client-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-accounts:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
