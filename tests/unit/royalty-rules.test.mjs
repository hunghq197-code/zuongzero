import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTrackRoyaltyRules,
  normalizeRoyaltyRuleIsrc,
  royaltyPercentToBps,
} from '../../lib/royalty-rules.ts';

function lineItem(overrides = {}) {
  return {
    accountNo: 'ZZ01',
    calculationMode: 'excel',
    configuration: 'Stream',
    contractName: 'Distribution 2026',
    contentType: 'Track',
    currency: 'VND',
    distributionChannel: 'Digital',
    grossIncome: 1_000,
    isrc: 'VN-A38-24-00008',
    netPayable: 820,
    partner: 'Spotify',
    periodEndDate: '2026-09-30',
    releaseArtist: 'Artist A',
    releaseLabel: 'Zuong Zero',
    releaseTitle: 'Release A',
    royaltyRate: 82,
    rowIndex: 2,
    sales: 10_000,
    salesPeriod: '2026-07',
    sourceNetPayable: 820,
    sourceRoyaltyRate: 82,
    startDate: '2026-07-01',
    territory: 'VN',
    trackArtist: 'Artist A',
    trackTitle: 'Track A',
    trackVersion: 'Original',
    ...overrides,
  };
}

const rule = {
  id: 'rule-1',
  royaltyRateBps: 7_000,
  trackExternalId: 'VNA382400008',
  trackTitle: 'Track A',
};

test('rows without a configured song rule preserve Excel net payable', () => {
  const result = applyTrackRoyaltyRules([lineItem()], []);

  assert.equal(result.items[0].netPayable, 820);
  assert.equal(result.items[0].royaltyRate, 82);
  assert.equal(result.items[0].calculationMode, 'excel');
  assert.equal(result.items[0].royaltyRuleId, null);
  assert.deepEqual(result.stats, {
    excelRows: 1,
    ruleGrossIncome: 0,
    ruleNetPayable: 0,
    ruleRows: 0,
  });
});

test('configured song rule calculates net payable from gross income and snapshots source values', () => {
  const result = applyTrackRoyaltyRules([lineItem()], [rule]);
  const applied = result.items[0];

  assert.equal(applied.netPayable, 700);
  assert.equal(applied.royaltyRate, 70);
  assert.equal(applied.sourceNetPayable, 820);
  assert.equal(applied.sourceRoyaltyRate, 82);
  assert.equal(applied.calculationMode, 'track_rule');
  assert.equal(applied.royaltyRuleId, 'rule-1');
  assert.equal(applied.appliedRoyaltyRateBps, 7_000);
  assert.deepEqual(result.stats, {
    excelRows: 0,
    ruleGrossIncome: 1_000,
    ruleNetPayable: 700,
    ruleRows: 1,
  });
});

test('configured song rule blocks rows that do not contain gross income', () => {
  const result = applyTrackRoyaltyRules(
    [lineItem({ grossIncome: null })],
    [rule],
  );

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].rowIndex, 2);
  assert.match(result.issues[0].message, /thiếu Gross Income/);
  assert.equal(result.stats.ruleRows, 0);
});

test('ISRC matching ignores separators and casing', () => {
  assert.equal(
    normalizeRoyaltyRuleIsrc(' vn-a38-24-00008 '),
    normalizeRoyaltyRuleIsrc('VNA382400008'),
  );
  assert.equal(royaltyPercentToBps(70.25), 7_025);

  const result = applyTrackRoyaltyRules(
    [lineItem({ isrc: 'vn-a38-24-00008' })],
    [rule],
  );
  assert.equal(result.items[0].netPayable, 700);
});
