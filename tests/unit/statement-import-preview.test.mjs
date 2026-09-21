import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImportConfirmationToken,
  sumStatementImportPreview,
} from '../../lib/statement-import-preview.ts';

test('safe import preview totals customer deltas and financial values', () => {
  const totals = sumStatementImportPreview([
    {
      currentRevenue: 100,
      currentRows: 2,
      excelRows: 3,
      guaranteeRecouped: 10,
      nextGrossRevenue: 180,
      nextPayable: 140,
      nextRevenue: 150,
      nextRows: 4,
      revenueDelta: 50,
      royaltyRuleRows: 1,
      rowDelta: 2,
    },
    {
      currentRevenue: 25,
      currentRows: 1,
      excelRows: 2,
      guaranteeRecouped: 5,
      nextGrossRevenue: 90,
      nextPayable: 60,
      nextRevenue: 65,
      nextRows: 3,
      revenueDelta: 40,
      royaltyRuleRows: 1,
      rowDelta: 2,
    },
  ]);

  assert.deepEqual(totals, {
    currentRevenue: 125,
    currentRows: 3,
    excelRows: 5,
    guaranteeRecouped: 15,
    nextGrossRevenue: 270,
    nextPayable: 200,
    nextRevenue: 215,
    nextRows: 7,
    revenueDelta: 90,
    royaltyRuleRows: 2,
    rowDelta: 4,
  });
});

test('confirmation token changes when the file or preview changes', async () => {
  const preview = {
    clientCount: 1,
    customers: [],
    destructive: false,
    filename: 'statement.xlsx',
    importStrategy: 'create',
    period: '2026-Q3',
    totals: {
      currentRevenue: 0,
      currentRows: 0,
      excelRows: 10,
      guaranteeRecouped: 0,
      nextGrossRevenue: 100,
      nextPayable: 80,
      nextRevenue: 80,
      nextRows: 10,
      revenueDelta: 80,
      royaltyRuleRows: 0,
      rowDelta: 10,
    },
    uploadMode: 'single',
    warnings: [],
  };
  const first = await createImportConfirmationToken({
    fileSha256: 'file-a',
    preview,
  });
  const same = await createImportConfirmationToken({
    fileSha256: 'file-a',
    preview,
  });
  const changedFile = await createImportConfirmationToken({
    fileSha256: 'file-b',
    preview,
  });
  const changedPreview = await createImportConfirmationToken({
    fileSha256: 'file-a',
    preview: {
      ...preview,
      totals: { ...preview.totals, nextRevenue: 81 },
    },
  });

  assert.equal(first, same);
  assert.notEqual(first, changedFile);
  assert.notEqual(first, changedPreview);
  assert.match(first, /^[a-f0-9]{64}$/);
});
