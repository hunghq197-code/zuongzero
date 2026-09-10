import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReverseGuaranteeRecoupmentStatements,
  normalizeTrackKey,
  planTrackGuaranteeRecoupments,
} from '../../lib/guarantees.ts';

class MockStatement {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MockStatement(this.db, this.sql, bindings);
  }

  async all() {
    return {
      results: this.db.resultsFor(this.sql, this.bindings),
    };
  }

  async first() {
    return this.db.resultsFor(this.sql, this.bindings)[0] ?? null;
  }

  async run() {
    this.db.runs.push(this);
    return { success: true };
  }
}

class MockD1 {
  constructor({ candidates = [], previousRecoupments = [] } = {}) {
    this.candidates = candidates;
    this.previousRecoupments = previousRecoupments;
    this.runs = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }

  resultsFor(sql) {
    if (sql.includes('sqlite_master')) {
      return [
        { name: 'track_guarantees' },
        { name: 'track_guarantee_recoupments' },
      ];
    }

    if (
      sql.includes('FROM track_guarantee_recoupments') &&
      sql.includes('WHERE report_period_id = ?')
    ) {
      return this.previousRecoupments;
    }

    if (
      sql.includes('FROM track_guarantees') &&
      sql.includes("status IN ('active', 'recouped')")
    ) {
      return this.candidates;
    }

    return [];
  }
}

test('track keys normalize accents, punctuation, and casing', () => {
  assert.equal(normalizeTrackKey('Bài Hát Số 01 - Remix!'), 'baihatso01remix');
  assert.equal(normalizeTrackKey('  THE   SINGLE  '), 'thesingle');
});

test('GM recoupment deducts at most the active track revenue and balance', async () => {
  const db = new MockD1({
    candidates: [
      {
        balanceAmount: 750,
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'gm-1',
        initialAmount: 1_000,
        recoupedAmount: 250,
        status: 'active',
        trackKey: normalizeTrackKey('Bài hát A'),
        trackTitle: 'Bài hát A',
      },
    ],
  });

  const plan = await planTrackGuaranteeRecoupments({
    clientId: 'client-1',
    db,
    now: '2026-09-10T00:00:00.000Z',
    reportPeriodId: 'client-1:2026-Q3:VND',
    sourceUploadId: 'upload-1',
    trackRevenue: [
      {
        rows: 2,
        trackTitle: 'Bai hat A',
        units: 100,
        value: 300,
      },
    ],
  });

  assert.equal(plan.deductionTotal, 300);
  assert.deepEqual(plan.recoupments, [
    {
      amount: 300,
      balanceAfter: 450,
      guaranteeId: 'gm-1',
      revenueAmount: 300,
      status: 'active',
      trackTitle: 'Bài hát A',
    },
  ]);
  assert.equal(plan.statements.length, 3);
  assert.match(
    plan.statements[0].sql,
    /DELETE FROM track_guarantee_recoupments/,
  );
  assert.match(plan.statements[1].sql, /UPDATE track_guarantees/);
  assert.match(
    plan.statements[2].sql,
    /INSERT INTO track_guarantee_recoupments/,
  );
});

test('GM recoupment reverses an existing period before replacing it', async () => {
  const db = new MockD1({
    candidates: [
      {
        balanceAmount: 300,
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'gm-1',
        initialAmount: 1_000,
        recoupedAmount: 700,
        status: 'active',
        trackKey: normalizeTrackKey('Single B'),
        trackTitle: 'Single B',
      },
    ],
    previousRecoupments: [{ amount: 200, guaranteeId: 'gm-1' }],
  });

  const plan = await planTrackGuaranteeRecoupments({
    clientId: 'client-1',
    db,
    now: '2026-09-10T00:00:00.000Z',
    reportPeriodId: 'client-1:2026-Q3:VND',
    sourceUploadId: 'upload-2',
    trackRevenue: [
      {
        rows: 1,
        trackTitle: 'Single B',
        units: 50,
        value: 100,
      },
    ],
  });

  assert.equal(plan.deductionTotal, 100);
  assert.equal(plan.recoupments[0].balanceAfter, 400);
  assert.equal(plan.statements.length, 4);
  assert.match(plan.statements[0].sql, /recouped_amount = max/);
  assert.match(
    plan.statements[1].sql,
    /DELETE FROM track_guarantee_recoupments/,
  );
});

test('statement delete builds GM reversal statements', async () => {
  const db = new MockD1({
    previousRecoupments: [{ amount: 450, guaranteeId: 'gm-2' }],
  });

  const statements = await buildReverseGuaranteeRecoupmentStatements(
    db,
    'client-1:2026-Q3:VND',
    '2026-09-10T00:00:00.000Z',
  );

  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /UPDATE track_guarantees/);
  assert.match(statements[1].sql, /DELETE FROM track_guarantee_recoupments/);
});
