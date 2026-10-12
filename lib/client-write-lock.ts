const LEASE_MS = 120_000;

export class ClientWriteError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}

// Only financial mutations use this scoped DB; reads keep the normal D1 API.
export async function withClientWriteLock<T>(
  db: D1Database,
  clientIds: string[],
  task: (db: D1Database) => Promise<T>,
): Promise<T> {
  const ids = [...new Set(clientIds)].sort();
  if (!ids.length) throw new ClientWriteError('Chưa chọn khách hàng.', 400);
  const scope = JSON.stringify(ids);
  const owner = crypto.randomUUID();
  const now = Date.now();
  let acquired: string[];
  try {
    const result = await db
      .prepare(`INSERT INTO client_write_locks (client_id, owner_token, expires_at)
      SELECT value, ?2, ?3 FROM json_each(?1) WHERE 1
      ON CONFLICT(client_id) DO UPDATE SET owner_token = excluded.owner_token, expires_at = excluded.expires_at
      WHERE client_write_locks.expires_at <= ?4
      RETURNING client_id AS clientId`)
      .bind(scope, owner, now + LEASE_MS, now)
      .all<{ clientId: string }>();
    acquired = result.results.map((row) => row.clientId);
  } catch {
    throw new ClientWriteError(
      'Dịch vụ cập nhật chưa sẵn sàng. Vui lòng thử lại sau.',
      503,
    );
  }

  try {
    if (acquired.length !== ids.length) {
      throw new ClientWriteError(
        'Khách hàng đang được cập nhật. Vui lòng thử lại sau ít phút.',
      );
    }
    const scoped = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async <R>(
            statements: D1PreparedStatement[],
          ): Promise<D1Result<R>[]> => {
            // Invalid JSON intentionally aborts the transaction if the lease was lost.
            const guard = db
              .prepare(`SELECT json(CASE WHEN
              (SELECT count(*) FROM client_write_locks WHERE client_id IN (SELECT value FROM json_each(?1))
                AND owner_token = ?2 AND expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000) = ?3
              THEN 'true' ELSE 'client-write-lease-lost' END)`)
              .bind(scope, owner, ids.length);
            try {
              const results = await db.batch<R>([guard, ...statements]);
              return results.slice(1);
            } catch (error) {
              const detail =
                error instanceof Error
                  ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
                  : '';
              if (detail.includes('malformed JSON')) {
                throw new ClientWriteError(
                  'Phiên cập nhật đã hết hạn. Hãy tải lại và thử lại.',
                );
              }
              throw error;
            }
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return await task(scoped);
  } finally {
    // Owner check prevents an old request from releasing a newer lease.
    try {
      await db
        .prepare(
          'DELETE FROM client_write_locks WHERE owner_token = ? AND client_id IN (SELECT value FROM json_each(?))',
        )
        .bind(owner, scope)
        .run();
    } catch {
      console.error(
        '[client-write-lock] release failed; lease expires automatically',
      );
    }
  }
}

export function clientWriteErrorResponse(error: unknown): Response | null {
  return error instanceof ClientWriteError
    ? Response.json({ message: error.message }, { status: error.status })
    : null;
}
