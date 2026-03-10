import { describe, it, expect } from 'vitest';
import { formatResult, isValidPeriod, isPeriodBefore } from '../src/utils/format.js';

describe('formatResult', () => {
  it('combines shekel and percentage with separator', () => {
    expect(formatResult(14028, 3.51)).toBe('₪14,028 / 3.51%');
  });

  it('matches expected Google Sheets output format', () => {
    expect(formatResult(90465, 5.7)).toBe('₪90,465 / 5.70%');
  });
});

describe('isValidPeriod', () => {
  it('accepts valid YYYY-MM', () => {
    expect(isValidPeriod('2024-02')).toBe(true);
    expect(isValidPeriod('2020-12')).toBe(true);
    expect(isValidPeriod('2024-01')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidPeriod('2024-13')).toBe(false);
    expect(isValidPeriod('2024-00')).toBe(false);
    expect(isValidPeriod('24-02')).toBe(false);
    expect(isValidPeriod('2024/02')).toBe(false);
    expect(isValidPeriod('2024-2')).toBe(false);
    expect(isValidPeriod('')).toBe(false);
  });
});

describe('isPeriodBefore', () => {
  it('returns true when from is before to', () => {
    expect(isPeriodBefore('2024-01', '2024-06')).toBe(true);
    expect(isPeriodBefore('2023-12', '2024-01')).toBe(true);
  });

  it('returns false when from equals to', () => {
    expect(isPeriodBefore('2024-03', '2024-03')).toBe(false);
  });

  it('returns false when from is after to', () => {
    expect(isPeriodBefore('2024-06', '2024-01')).toBe(false);
  });
});
