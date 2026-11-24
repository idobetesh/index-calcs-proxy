/**
 * Formats the final result string as expected by Google Sheets.
 * e.g. "₪14,028 / 3.51%"
 */
export function formatResult(indexedAmount: number, percentage: number): string {
  return `₪${Math.round(indexedAmount).toLocaleString('en-US')} / ${percentage.toFixed(2)}%`;
}

/**
 * Returns true if the string is a valid YYYY-MM period string.
 */
export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/**
 * Returns true if `from` is strictly before `to` (both YYYY-MM).
 */
export function isPeriodBefore(from: string, to: string): boolean {
  return from < to;
}

export function shiftPeriod(period: string, months: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5));
  const offset = year * 12 + month - 1 + months;
  return `${String(Math.floor(offset / 12)).padStart(4, '0')}-${String((offset % 12) + 1).padStart(2, '0')}`;
}

export function currentIsraelPeriod(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}
