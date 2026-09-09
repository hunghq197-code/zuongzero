export const DASHBOARD_TIME_ZONE = 'Asia/Bangkok';
export const DEFAULT_MONTH_OPTION_COUNT = 36;

export type MonthOption = {
  value: string;
  label: string;
};

export function currentCalendarMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    month: '2-digit',
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  if (!year || !month) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  return `${year}-${month}`;
}

export function buildCalendarMonthOptions(
  count = DEFAULT_MONTH_OPTION_COUNT,
  now = new Date(),
): MonthOption[] {
  const currentMonth = currentCalendarMonth(now);

  return Array.from({ length: count }, (_, index) => {
    const value = addMonths(currentMonth, -index);
    return {
      label: periodDisplayLabel(value),
      value,
    };
  });
}

export function periodDisplayLabel(period: string) {
  const [year, month] = period.split('-');
  const monthNumber = Number(month);

  if (
    year &&
    month &&
    /^\d{4}$/.test(year) &&
    Number.isInteger(monthNumber) &&
    monthNumber >= 1 &&
    monthNumber <= 12
  ) {
    return `${year} - M${monthNumber}`;
  }

  return period || 'Current period';
}

function addMonths(period: string, offset: number) {
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const zeroBasedMonth = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(zeroBasedMonth / 12);
  const nextMonth = zeroBasedMonth - nextYear * 12 + 1;

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}
