import { env } from 'cloudflare:workers';
import { setTestIdentity } from './identity';
import {
  GET as template,
  POST as importRules,
} from '../../app/api/admin/royalty-rules/import/route';
import {
  PATCH as patchStatement,
  DELETE as deleteStatement,
} from '../../app/api/admin/statements/route';
import { POST as upload } from '../../app/api/admin/uploads/route';
import { POST as rollback } from '../../app/api/admin/uploads/rollback/route';
import { POST as createGuarantee } from '../../app/api/admin/guarantees/route';
import { POST as changePassword } from '../../app/api/account/password/route';
import {
  PATCH as editCustomer,
  DELETE as deleteCustomer,
} from '../../app/api/admin/customers/route';
import { getClientDashboardData } from '../../lib/client-dashboard-data';
import { listSettlementReminderRecipients } from '../../lib/settlement-reminders';
import { readStatementBalances } from '../../lib/statement-balances';
import { getStatementExportData } from '../../lib/statement-export';

const testWorker = {
  async fetch(request: Request) {
    setTestIdentity(request.headers.get('x-test-email') ?? '');
    const url = new URL(request.url);
    if (url.pathname === '/rules')
      return request.method === 'GET' ? template() : importRules(request);
    if (url.pathname === '/statements')
      return request.method === 'DELETE'
        ? deleteStatement(request)
        : patchStatement(request);
    if (url.pathname === '/uploads') return upload(request);
    if (url.pathname === '/rollback') return rollback(request);
    if (url.pathname === '/guarantees') return createGuarantee(request);
    if (url.pathname === '/password') return changePassword(request);
    if (url.pathname === '/customers')
      return request.method === 'DELETE'
        ? deleteCustomer(request)
        : editCustomer(request);
    if (url.pathname === '/balances')
      return Response.json(
        Object.fromEntries(await readStatementBalances(env.DB)),
      );
    if (url.pathname === '/client')
      return Response.json(
        await getClientDashboardData({ clientId: 'a', clientName: 'Artist A' }),
      );
    if (url.pathname === '/reminders')
      return Response.json(
        await listSettlementReminderRecipients(env.DB, '2026-Q2'),
      );
    if (url.pathname === '/export')
      return Response.json(
        await getStatementExportData(env.DB, url.searchParams.get('id') ?? '', {
          clientId: 'a',
          publishedOnly: true,
        }),
      );
    return new Response(null, { status: 404 });
  },
};
export default testWorker;
