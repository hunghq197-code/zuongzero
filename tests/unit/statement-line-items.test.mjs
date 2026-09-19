import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeStatementLineItems,
  statementLineItemMergeKey,
} from '../../lib/statement-line-items.ts';

function lineItem(overrides = {}) {
  return {
    accountNo: 'ZZ01',
    configuration: 'Stream',
    contractName: 'Distribution 2026',
    contentType: 'Track',
    currency: 'VND',
    distributionChannel: 'Digital',
    grossIncome: 120,
    isrc: 'VN-A38-24-00008',
    netPayable: 100,
    partner: 'Spotify',
    periodEndDate: '2026-09-30',
    releaseArtist: 'Artist A',
    releaseLabel: 'Zuong Zero',
    releaseTitle: 'Release A',
    royaltyRate: 80,
    rowIndex: 2,
    sales: 1_000,
    salesPeriod: '2026-07',
    startDate: '2026-07-01',
    territory: 'VN',
    trackArtist: 'Artist A',
    trackTitle: 'Track A',
    trackVersion: 'Original',
    ...overrides,
  };
}

test('statement sync adds new business keys and updates matching rows', () => {
  const existing = [lineItem()];
  const incoming = [
    lineItem({ grossIncome: 240, netPayable: 200, sales: 2_000 }),
    lineItem({
      isrc: 'VN-A38-24-00009',
      netPayable: 75,
      rowIndex: 3,
      sales: 750,
      trackTitle: 'Track B',
    }),
  ];

  const result = mergeStatementLineItems(existing, incoming);

  assert.deepEqual(result.stats, {
    added: 1,
    previous: 1,
    total: 2,
    unchanged: 0,
    updated: 1,
  });
  assert.equal(result.items[0].netPayable, 200);
  assert.equal(result.items[1].trackTitle, 'Track B');
});

test('statement sync is idempotent when the same rows are uploaded again', () => {
  const existing = [lineItem()];
  const result = mergeStatementLineItems(existing, [
    lineItem({ rowIndex: 99 }),
  ]);

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.stats, {
    added: 0,
    previous: 1,
    total: 1,
    unchanged: 1,
    updated: 0,
  });
});

test('merge keys ignore casing and spacing but keep business dimensions', () => {
  assert.equal(
    statementLineItemMergeKey(lineItem()),
    statementLineItemMergeKey(
      lineItem({
        accountNo: ' zz01 ',
        partner: 'SPOTIFY',
        trackTitle: '  Track   A ',
      }),
    ),
  );
  assert.notEqual(
    statementLineItemMergeKey(lineItem()),
    statementLineItemMergeKey(lineItem({ territory: 'US' })),
  );
});

test('duplicate business keys keep their source-row granularity', () => {
  const existing = [
    lineItem({ grossIncome: 60, netPayable: 50, sales: 500 }),
    lineItem({ grossIncome: 90, netPayable: 75, rowIndex: 3, sales: 750 }),
  ];
  const result = mergeStatementLineItems(existing, [
    lineItem({ grossIncome: 72, netPayable: 60, sales: 600 }),
    lineItem({ grossIncome: 90, netPayable: 75, rowIndex: 9, sales: 750 }),
    lineItem({ grossIncome: 30, netPayable: 25, rowIndex: 10, sales: 250 }),
  ]);

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].netPayable, 60);
  assert.equal(result.items[1].netPayable, 75);
  assert.equal(result.items[2].netPayable, 25);
  assert.deepEqual(result.stats, {
    added: 1,
    previous: 2,
    total: 3,
    unchanged: 1,
    updated: 1,
  });
});
