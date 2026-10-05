import type { BreakdownItem } from './dashboard-data';

type SourceDate = string | number | null | undefined;

export type SalesPeriodSourceRow = {
  salesPeriod: SourceDate;
  periodEndDate?: SourceDate;
  startDate?: SourceDate;
  netPayable: number;
  sales: number;
  rowCount?: number;
};

type SourcePeriod = {
  key: string;
  name: string;
  sortOrder: number;
  granularity: 'month' | 'quarter' | 'unknown';
};

export type SalesPeriodBreakdown = BreakdownItem & SourcePeriod;

function sourceLabel(value: SourceDate) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function validMonth(year: number, month: number, day = 1) {
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth
    ? `${year}-${String(month).padStart(2, '0')}`
    : null;
}

/** Parse source dates without changing their calendar month for a time zone. */
export function normalizeSalesMonth(value: SourceDate): string | null {
  const raw = sourceLabel(value);
  if (!raw) return null;

  const yearFirst = raw.match(
    /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2})(?:[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?$/i,
  );
  if (yearFirst) {
    return validMonth(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3] ?? 1),
    );
  }

  const monthYear = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (monthYear) return validMonth(Number(monthYear[2]), Number(monthYear[1]));

  const date = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (date) {
    // Day/month/year follows the portal locale; unambiguous US dates also work.
    const first = Number(date[1]);
    const second = Number(date[2]);
    return second > 12
      ? validMonth(Number(date[3]), first, second)
      : validMonth(Number(date[3]), second, first);
  }

  if (/^\d{6}$/.test(raw)) {
    return (
      validMonth(Number(raw.slice(0, 4)), Number(raw.slice(4))) ??
      validMonth(Number(raw.slice(2)), Number(raw.slice(0, 2)))
    );
  }
  if (/^\d{8}$/.test(raw)) {
    return validMonth(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)),
      Number(raw.slice(6)),
    );
  }

  const namedMonth = raw.toLowerCase().match(/^([a-z]+)[\s-]+(\d{4})$/);
  if (namedMonth) {
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const month =
      months.findIndex(
        (name) => name === namedMonth[1] || name.slice(0, 3) === namedMonth[1],
      ) + 1;
    return validMonth(Number(namedMonth[2]), month);
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    // Match the importer's supported 1900-system Excel date range.
    if (serial >= 20_000 && serial <= 80_000) {
      const date = new Date(
        Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000,
      );
      return validMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
    }
  }
  return null;
}

function sourceQuarter(raw: string) {
  const value = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const yearFirst = value.match(/^((?:19|20|21)\d{2})\s*[-/]?\s*Q([1-4])$/);
  if (yearFirst)
    return { year: Number(yearFirst[1]), quarter: Number(yearFirst[2]) };
  const quarterFirst = value.match(
    /^(?:Q|QUY\s*)([1-4])\s*[-/ ]\s*((?:19|20|21)\d{2})$/,
  );
  return quarterFirst
    ? { year: Number(quarterFirst[2]), quarter: Number(quarterFirst[1]) }
    : null;
}

function monthPeriod(key: string): SourcePeriod {
  return {
    key,
    name: `${key.slice(5)}/${key.slice(0, 4)}`,
    sortOrder: Number(key.replace('-', '')),
    granularity: 'month',
  };
}

function resolveSourcePeriod(row: SalesPeriodSourceRow): SourcePeriod {
  const month = normalizeSalesMonth(row.salesPeriod);
  if (month) return monthPeriod(month);

  const raw = sourceLabel(row.salesPeriod);
  const quarter = sourceQuarter(raw);
  const [endMonth, startMonth] = [row.periodEndDate, row.startDate].map(
    normalizeSalesMonth,
  );
  // Statement bounds spanning several months cannot identify a sales month.
  // Preserve explicit source labels instead of inferring a different period.
  const fallback =
    !raw && endMonth && startMonth === endMonth ? endMonth : null;
  if (fallback) return monthPeriod(fallback);

  if (quarter) {
    const key = `${quarter.year}-Q${quarter.quarter}`;
    return {
      key,
      name: `Qu\u00fd ${quarter.quarter}/${quarter.year} (ch\u01b0a r\u00f5 th\u00e1ng)`,
      sortOrder: quarter.year * 100 + (quarter.quarter - 1) * 3 + 1,
      granularity: 'quarter',
    };
  }
  return {
    key: `unknown:${raw}`,
    name: raw || 'Ch\u01b0a x\u00e1c \u0111\u1ecbnh th\u00e1ng',
    sortOrder: Number.POSITIVE_INFINITY,
    granularity: 'unknown',
  };
}

/** Accept raw lines or complete SQL aggregates for one selected statement. */
export function aggregateSalesPeriods(
  rows: readonly SalesPeriodSourceRow[],
): SalesPeriodBreakdown[] {
  const groups = new Map<string, SalesPeriodBreakdown>();
  for (const row of rows) {
    const period = resolveSourcePeriod(row);
    const current = groups.get(period.key) ?? {
      ...period,
      percentage: 0,
      rows: 0,
      units: 0,
      value: 0,
    };
    current.rows += row.rowCount ?? 1;
    current.units += row.sales;
    current.value += row.netPayable;
    groups.set(period.key, current);
  }

  const result = Array.from(groups.values()).sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
  );
  const total = result.reduce((sum, row) => sum + Math.abs(row.value), 0);
  return result.map((row) => ({
    ...row,
    percentage: total > 0 ? (Math.abs(row.value) / total) * 100 : 0,
  }));
}
