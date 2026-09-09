import { createSessionToken, hashSessionToken } from '@/lib/app-auth';

export const ACCOUNT_INVITE_MAX_AGE_DAYS = 7;
export const PASSWORD_RESET_MAX_AGE_MINUTES = 30;

export type AccountInvitePurpose = 'account_activation' | 'password_reset';
export type AccountInviteStatus = 'pending' | 'used' | 'revoked' | 'expired';

export type AccountInviteDetails = {
  clientId: string | null;
  clientName: string | null;
  companyName: string | null;
  displayName: string | null;
  email: string;
  expiresAt: string;
  id: string;
  phone: string | null;
  purpose: AccountInvitePurpose;
  role: 'super_admin' | 'admin' | 'client' | 'auditor' | 'pending';
  status: AccountInviteStatus;
  userId: string;
};

type StoredInviteRow = Omit<AccountInviteDetails, 'status'> & {
  inviteStatus: 'pending' | 'used' | 'revoked';
};

export async function createAccountInvite(
  db: D1Database,
  input: {
    createdByUserId: string;
    email: string;
    purpose?: AccountInvitePurpose;
    requestUrl: string;
    userId: string;
  },
) {
  const purpose = input.purpose ?? 'account_activation';
  const now = new Date();
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const inviteId = crypto.randomUUID();
  const maxAgeMs =
    purpose === 'password_reset'
      ? PASSWORD_RESET_MAX_AGE_MINUTES * 60 * 1000
      : ACCOUNT_INVITE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + maxAgeMs).toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE account_invites
         SET status = 'revoked'
         WHERE user_id = ?
           AND purpose = ?
           AND status = 'pending'`,
      )
      .bind(input.userId, purpose),
    db
      .prepare(
        `INSERT INTO account_invites (
           id,
           user_id,
           email,
           token_hash,
           purpose,
           status,
           created_by_user_id,
           expires_at,
           used_at,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?)`,
      )
      .bind(
        inviteId,
        input.userId,
        input.email,
        tokenHash,
        purpose,
        input.createdByUserId,
        expiresAt,
        now.toISOString(),
      ),
  ]);

  return {
    expiresAt,
    inviteUrl: buildAccountInviteUrl(input.requestUrl, token, purpose),
    token,
  };
}

export async function readAccountInviteByToken(
  db: D1Database,
  token: string,
  now = new Date(),
): Promise<AccountInviteDetails | null> {
  if (!isPlausibleInviteToken(token)) return null;

  const tokenHash = await hashSessionToken(token);
  const row = await db
    .prepare(
      `SELECT
         ai.id,
         ai.user_id AS userId,
         ai.email,
         ai.purpose,
         ai.status AS inviteStatus,
         ai.expires_at AS expiresAt,
         u.display_name AS displayName,
         u.company_name AS companyName,
         u.phone,
         u.role,
         cu.client_id AS clientId,
         c.display_name AS clientName
       FROM account_invites ai
       JOIN users u
         ON u.id = ai.user_id
       LEFT JOIN client_users cu
         ON cu.user_id = u.id
        AND cu.status = 'active'
       LEFT JOIN clients c
         ON c.id = cu.client_id
       WHERE ai.token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<StoredInviteRow>();

  if (!row) return null;

  return {
    ...row,
    status: resolveInviteStatus(row.inviteStatus, row.expiresAt, now),
  };
}

export function cleanInviteToken(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}

function buildAccountInviteUrl(
  requestUrl: string,
  token: string,
  purpose: AccountInvitePurpose,
) {
  const url = new URL(
    purpose === 'password_reset' ? '/reset-password' : '/setup-account',
    requestUrl,
  );
  url.searchParams.set('token', token);
  return url.toString();
}

function resolveInviteStatus(
  storedStatus: StoredInviteRow['inviteStatus'],
  expiresAt: string,
  now: Date,
): AccountInviteStatus {
  if (storedStatus !== 'pending') return storedStatus;
  if (new Date(expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

function isPlausibleInviteToken(token: string) {
  return /^[A-Za-z0-9_-]{32,200}$/.test(token);
}
