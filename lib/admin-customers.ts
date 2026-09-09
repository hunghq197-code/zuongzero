import { clients } from '@/lib/dashboard-data';

export type ManagedCustomerRow = {
  code: string;
  id: string;
  latestPeriod: string | null;
  name: string;
  status: string;
  totalRevenue: number;
  uploadedQuarters: number;
  viewerEmail: string | null;
};

export async function listManagedCustomers(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT
         c.id,
         c.code,
         c.display_name AS name,
         (
           SELECT group_concat(u.email, ', ')
           FROM client_users cu
           JOIN users u
             ON u.id = cu.user_id
            AND u.role = 'client'
           WHERE cu.client_id = c.id
             AND cu.status = 'active'
         ) AS viewerEmail,
         (
           SELECT max(period)
         FROM report_periods rp
         WHERE rp.client_id = c.id
           AND rp.status IN ('published', 'locked')
           AND rp.currency = 'VND'
       ) AS latestPeriod,
       (
         SELECT count(DISTINCT rp.period)
         FROM report_periods rp
         WHERE rp.client_id = c.id
           AND rp.status IN ('published', 'locked')
           AND rp.currency = 'VND'
       ) AS uploadedQuarters,
       (
         SELECT COALESCE(sum(s.net_revenue), 0)
         FROM statements s
         JOIN report_periods rp
           ON rp.id = s.report_period_id
         WHERE s.client_id = c.id
           AND rp.currency = 'VND'
       ) AS totalRevenue,
       c.status
       FROM clients c
       ORDER BY c.created_at DESC
       LIMIT 100`,
    )
    .all<ManagedCustomerRow>();

  return rows.results;
}

export function fallbackCustomerRows(): ManagedCustomerRow[] {
  return clients.map((client) => ({
    code: client.code,
    id: client.id,
    latestPeriod: client.latestPeriod,
    name: client.name,
    status: client.status,
    totalRevenue: client.totalRevenue,
    uploadedQuarters: client.uploadedQuarters,
    viewerEmail: client.viewerEmail,
  }));
}
