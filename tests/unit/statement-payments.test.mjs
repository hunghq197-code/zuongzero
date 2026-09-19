import assert from 'node:assert/strict';
import test from 'node:test';

import {
  summarizeSettlement,
  summarizeStatementPayment,
} from '../../lib/settlements.ts';

test('eligible statements remain unpaid until an admin marks them paid', () => {
  const settlement = summarizeSettlement({
    opening: 0,
    revenue: 2_000_000,
  });
  const payment = summarizeStatementPayment(settlement, 'unpaid');

  assert.equal(settlement.status, 'paid');
  assert.equal(payment.status, 'unpaid');
  assert.equal(payment.paidAmount, 0);
});

test('marking an eligible statement paid exposes its payable amount', () => {
  const settlement = summarizeSettlement({
    opening: 200_000,
    revenue: 1_000_000,
  });
  const payment = summarizeStatementPayment(settlement, 'paid');

  assert.equal(payment.status, 'paid');
  assert.equal(payment.paidAmount, 1_200_000);
});

test('below-threshold statements cannot appear paid', () => {
  const settlement = summarizeSettlement({
    opening: 0,
    revenue: 900_000,
  });
  const payment = summarizeStatementPayment(settlement, 'paid');

  assert.equal(settlement.status, 'carried_forward');
  assert.equal(payment.status, 'unpaid');
  assert.equal(payment.paidAmount, 0);
});
