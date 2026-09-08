import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { accountUserIdForEmail, normalizeEmail } from '@/lib/identity';

export type AppUserRole =
  | 'super_admin'
  | 'admin'
  | 'client'
  | 'auditor'
  | 'pending';

type StoredUserRecord = {
  id: string;
  email: string;
  role: AppUserRole;
};

export async function ensureUserRecord(
  db: D1Database,
  input: {
    email: string;
    role: AppUserRole;
    displayName?: string | null;
    lastSeenAt?: string | null;
    status?: 'active' | 'disabled';
    userId?: string | null;
  },
) {
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const userId = input.userId?.trim() || accountUserIdForEmail(email);
  const displayName = cleanDisplayName(input.displayName);
  const lastSeenAt = input.lastSeenAt ?? null;
  const status = input.status ?? 'active';

  await db
    .prepare(
      `INSERT INTO users (
         id,
         email,
         display_name,
         role,
         status,
         created_at,
         last_seen_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, users.display_name),
         role = CASE
           WHEN users.role = 'super_admin' THEN users.role
           WHEN excluded.role = 'pending' AND users.role IN ('admin', 'client', 'auditor') THEN users.role
           ELSE excluded.role
         END,
         status = excluded.status,
         last_seen_at = COALESCE(excluded.last_seen_at, users.last_seen_at)`,
    )
    .bind(userId, email, displayName, input.role, status, now, lastSeenAt)
    .run();

  const storedUser = await db
    .prepare(
      `SELECT id, email, role
       FROM users
       WHERE lower(email) = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<StoredUserRecord>();

  return (
    storedUser ?? {
      id: userId,
      email,
      role: input.role,
    }
  );
}

export function authenticatedUserInput(user: ChatGPTUser, role: AppUserRole) {
  return {
    displayName: user.displayName,
    email: user.email,
    lastSeenAt: new Date().toISOString(),
    role,
    userId: user.userId,
  };
}

function cleanDisplayName(value: string | null | undefined) {
  const clean = typeof value === 'string' ? value.trim() : '';
  return clean || null;
}
