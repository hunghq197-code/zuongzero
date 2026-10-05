import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminConsole } from '@/components/admin-console';
import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import {
  TablePagination,
  usePaginatedRows,
} from '@/components/table-pagination';
import '@/app/globals.css';
import { periods } from '@/lib/dashboard-data';
import type { StatementLineItem } from '@/lib/statement-line-items';

const trackPeriod = {
  ...periods[0],
  id: 'preview-tracks',
  clientId: 'preview-client',
};
const trackRows: StatementLineItem[] = Array.from(
  { length: 35 },
  (_, index) => ({
    accountNo: 'preview-client',
    configuration: null,
    contractName: null,
    contentType: null,
    currency: 'VND',
    distributionChannel: null,
    grossIncome: null,
    isrc: `VNTEST${index + 1}`,
    netPayable: 1000,
    partner: null,
    periodEndDate: null,
    releaseArtist: null,
    releaseLabel: null,
    releaseTitle: null,
    royaltyRate: null,
    rowIndex: index + 1,
    sales: 1,
    salesPeriod: null,
    startDate: null,
    territory: null,
    trackArtist: 'Nghệ sĩ thử nghiệm',
    trackTitle: `Bài hát ${index + 1}`,
    trackVersion: null,
  }),
);

function PaginationPreview() {
  const [scope, setScope] = useState('first');
  const rows = Array.from({ length: 35 }, (_, index) => index + 1);
  const pagination = usePaginatedRows(rows, 10, scope);
  return (
    <main>
      <button
        onClick={() =>
          setScope((value) => (value === 'first' ? 'second' : 'first'))
        }
        type="button"
      >
        Đổi bộ lọc
      </button>
      <output data-testid="page">{pagination.page}</output>
      <div>
        {pagination.visibleRows.map((row) => (
          <span key={row}>{row} </span>
        ))}
      </div>
      <TablePagination {...pagination} />
    </main>
  );
}

const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')!).render(
  view === 'pagination' ? (
    <PaginationPreview />
  ) : view === 'client' || view === 'tracks' ? (
    <RoyaltyDashboard
      accessLevel="viewer"
      clientId="preview-client"
      clientName="Nghệ sĩ thử nghiệm"
      userEmail="preview@example.com"
      statementPeriods={view === 'tracks' ? [trackPeriod] : []}
      lineItemsByPeriod={
        view === 'tracks' ? { [trackPeriod.period]: trackRows } : {}
      }
      trend={[]}
      breakdownsByPeriod={{}}
    />
  ) : (
    <AdminConsole adminRole="super_admin" userEmail="preview@example.com" />
  ),
);
