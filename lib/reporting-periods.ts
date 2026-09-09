export const DASHBOARD_TIME_ZONE = 'Asia/Bangkok';
export const DEFAULT_QUARTER_OPTION_COUNT = 16;
export const REPORT_PERIOD_PATTERN = /^20\d{2}-Q[1-4]$/;

export type QuarterOption = {
  value: string;
  label: string;
};

export function currentCalendarQuarter(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    month: '2-digit',
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const monthText = parts.find((part) => part.type === 'month')?.value;
  const month = Number(monthText || now.getUTCMonth() + 1);
  const quarter = monthToQuarter(month);

  return `${year || now.getUTCFullYear()}-Q${quarter}`;
}

export function buildCalendarQuarterOptions(
  count = DEFAULT_QUARTER_OPTION_COUNT,
  now = new Date(),
): QuarterOption[] {
  const currentQuarter = currentCalendarQuarter(now);

  return Array.from({ length: count }, (_, index) => {
    const value = addQuarters(currentQuarter, -index);
    return {
      label: periodDisplayLabel(value),
      value,
    };
  });
}

export function periodDisplayLabel(period: string) {
  const match = period.match(/^(20\d{2})-Q([1-4])$/);

  if (match) {
    return `${match[1]} - Q${match[2]}`;
  }

  return period || 'Current quarter';
}

export function previousCalendarQuarter(period: string) {
  return addQuarters(period, -1);
}

function addQuarters(period: string, offset: number) {
  const match = period.match(/^(20\d{2})-Q([1-4])$/);
  if (!match) return currentCalendarQuarter();

  const yearText = match[1];
  const quarterText = match[2];
  const year = Number(yearText);
  const quarter = Number(quarterText);
  const zeroBasedQuarter = year * 4 + quarter - 1 + offset;
  const nextYear = Math.floor(zeroBasedQuarter / 4);
  const nextQuarter = zeroBasedQuarter - nextYear * 4 + 1;

  return `${nextYear}-Q${nextQuarter}`;
}

function monthToQuarter(month: number) {
  if (month >= 1 && month <= 12) {
    return Math.floor((month - 1) / 3) + 1;
  }

  return Math.floor(new Date().getUTCMonth() / 3) + 1;
}
