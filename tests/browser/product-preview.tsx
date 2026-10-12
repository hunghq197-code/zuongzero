import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminConsole } from '@/components/admin-console';
import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import { RoyaltyRulesPanel } from '@/components/royalty-rules-panel';
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

const previewParams = new URLSearchParams(window.location.search);
const view =
  previewParams.get('view') ??
  (previewParams.has('period') ? 'financial' : null);
const isPaid = previewParams.get('payment') === 'paid';
const financialPeriods = [
  {
    ...trackPeriod,
    id: 'finance-q3',
    period: '2026-Q3',
    opening: 1_200_000,
    grossRevenue: 1_000_000,
    revenue: 800_000,
    costs: 100_000,
    reservesWithheld: 0,
    reservesReleased: 0,
    paid: isPaid ? 1_900_000 : 0,
    paymentStatus: isPaid ? ('paid' as const) : ('unpaid' as const),
    payable: 1_900_000,
    carryForward: isPaid ? 0 : 1_900_000,
  },
  {
    ...trackPeriod,
    id: 'finance-q2',
    period: '2026-Q2',
    opening: 0,
    grossRevenue: 1_500_000,
    revenue: 1_200_000,
    costs: 0,
    reservesWithheld: 0,
    reservesReleased: 0,
    paid: 0,
    paymentStatus: 'unpaid' as const,
    payable: 1_200_000,
    carryForward: 1_200_000,
  },
];
if (previewParams.get('amount') === 'large') {
  Object.assign(financialPeriods[0], {
    grossRevenue: 9_876_543_210_123,
    opening: 987_654_321_000,
    revenue: 8_765_432_109_999,
    costs: 0,
    payable: 9_753_086_430_999,
    carryForward: 9_753_086_430_999,
  });
}
if (previewParams.get('history') === 'many') {
  financialPeriods.push(
    ...Array.from({ length: 12 }, (_, index) => {
      const quarterIndex = 2026 * 4 - index;
      const year = Math.floor(quarterIndex / 4);
      const quarter = (quarterIndex % 4) + 1;
      return {
        ...financialPeriods[0],
        id: `finance-history-${index}`,
        period: `${year}-Q${quarter}`,
      };
    }),
  );
}
createRoot(document.getElementById('root')!).render(
  view === 'pagination' ? (
    <PaginationPreview />
  ) : view === 'rules' ? (
    <main className="mx-auto max-w-7xl p-4">
      <RoyaltyRulesPanel
        customers={[
          {
            id: 'a',
            code: 'A001',
            name: 'Nghệ sĩ thử nghiệm',
            status: 'active',
          },
        ]}
      />
    </main>
  ) : view === 'client' || view === 'tracks' || view === 'financial' ? (
    <RoyaltyDashboard
      accessLevel="viewer"
      clientId="preview-client"
      clientName="Nghệ sĩ thử nghiệm"
      initialPeriod={previewParams.get('period') ?? undefined}
      userEmail="preview@example.com"
      statementPeriods={
        view === 'financial'
          ? financialPeriods
          : view === 'tracks'
            ? [trackPeriod]
            : []
      }
      salesPeriodsByPeriod={
        view === 'financial'
          ? {
              '2026-Q3': ['2026-07', '08/2026', '202609'].map(
                (salesPeriod) => ({
                  salesPeriod,
                  netPayable: 800_000 / 3,
                  sales: 100,
                }),
              ),
              '2026-Q2': [
                { salesPeriod: '2026-04', netPayable: 1_200_000, sales: 200 },
              ],
            }
          : {}
      }
      sourceInsightsByPeriod={
        view === 'tracks'
          ? {
              [trackPeriod.period]: {
                configurations: [],
                contentTypes: [],
                contracts: [],
                releaseArtists: [],
                trackIdentities: trackRows.map((row) => ({
                  isrc: row.isrc ?? '-',
                  trackTitle: row.trackTitle ?? '-',
                  trackVersion: row.trackVersion,
                  netPayable: row.netPayable,
                  sales: row.sales,
                })),
              },
            }
          : {}
      }
      trend={[]}
      breakdownsByPeriod={{}}
    />
  ) : (
    <AdminConsole adminRole="super_admin" userEmail="preview@example.com" />
  ),
);
