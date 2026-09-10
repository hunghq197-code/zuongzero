import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCalendarQuarterOptions,
  currentCalendarQuarter,
  DASHBOARD_TIME_ZONE,
  periodDisplayLabel,
  previousCalendarQuarter,
  REPORT_PERIOD_PATTERN,
} from '../../lib/reporting-periods.ts';

test('reporting periods use Asia/Bangkok calendar quarters', () => {
  assert.equal(DASHBOARD_TIME_ZONE, 'Asia/Bangkok');
  assert.equal(
    currentCalendarQuarter(new Date('2025-03-31T16:59:59.000Z')),
    '2025-Q1',
  );
  assert.equal(
    currentCalendarQuarter(new Date('2025-03-31T17:00:00.000Z')),
    '2025-Q2',
  );
});

test('quarter options are current-to-past Gregorian quarters', () => {
  const options = buildCalendarQuarterOptions(
    5,
    new Date('2026-01-10T00:00:00.000Z'),
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ['2026-Q1', '2025-Q4', '2025-Q3', '2025-Q2', '2025-Q1'],
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ['2026 - Q1', '2025 - Q4', '2025 - Q3', '2025 - Q2', '2025 - Q1'],
  );
});

test('period helpers reject month-style periods', () => {
  assert.equal(REPORT_PERIOD_PATTERN.test('2025-Q3'), true);
  assert.equal(REPORT_PERIOD_PATTERN.test('2025-03'), false);
  assert.equal(periodDisplayLabel('2025-Q4'), '2025 - Q4');
  assert.equal(previousCalendarQuarter('2025-Q1'), '2024-Q4');
});
