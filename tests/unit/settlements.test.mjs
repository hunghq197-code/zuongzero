import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SETTLEMENT_THRESHOLD_VND,
  summarizeSettlement,
} from '../../lib/settlements.ts';

test('settlement pays when payable reaches the VND threshold', () => {
  const summary = summarizeSettlement({
    opening: 250_000,
    revenue: 750_000,
  });

  assert.equal(summary.payable, SETTLEMENT_THRESHOLD_VND);
  assert.equal(summary.status, 'paid');
  assert.equal(summary.paidAmount, SETTLEMENT_THRESHOLD_VND);
  assert.equal(summary.carryForward, 0);
});

test('settlement carries forward balances below the VND threshold', () => {
  const summary = summarizeSettlement({
    costs: 125_000,
    opening: 100_000,
    reservesReleased: 50_000,
    reservesWithheld: 25_000,
    revenue: 900_000,
  });

  assert.equal(summary.payable, 900_000);
  assert.equal(summary.status, 'carried_forward');
  assert.equal(summary.paidAmount, 0);
  assert.equal(summary.carryForward, 900_000);
});

test('settlement rounds currency consistently', () => {
  const summary = summarizeSettlement({
    costs: 0.333,
    opening: 0,
    revenue: 1_000_000.337,
  });

  assert.equal(summary.payable, 1_000_000);
  assert.equal(summary.status, 'paid');
});
