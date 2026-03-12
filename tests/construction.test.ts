import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateConstruction } from '../src/calculations/construction.js';
import * as cbs from '../src/services/cbs.js';
import * as cbsCalc from '../src/services/cbsCalculator.js';
import { CalcParams } from '../src/types/calc.js';

const MOCK_ENTRIES = [
  { period: '2024-01', value: 200.0, monthlyPercent: 0.0 },
  { period: '2024-02', value: 202.0, monthlyPercent: 1.0 },
  { period: '2024-03', value: 205.0, monthlyPercent: 1.5 },
  { period: '2024-04', value: 206.0, monthlyPercent: 0.5 },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(cbsCalc, 'fetchCbsCalculation').mockRejectedValue(new Error('mocked unavailable'));
});

describe('calculateConstruction', () => {
  it('calculates indexed amount correctly by chaining monthly percents', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);

    const params: CalcParams = {
      amount: 100000,
      from: '2024-01',
      to: '2024-04',
      index: 'construction',
      format: 'text',
    };

    const result = await calculateConstruction(params);

    // multiplier = 1.01 * 1.015 * 1.005 = 1.030276...
    expect(result.originalAmount).toBe(100000);
    expect(result.fromPeriod).toBe('2024-01');
    expect(result.toPeriod).toBe('2024-04');
    expect(result.indexedAmount).toBe(103028);
    expect(result.difference).toBe(3028);
    expect(result.percentage).toBeCloseTo(3.03, 1);
  });

  it('falls back to latest entry when to period is not available', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);

    const params: CalcParams = {
      amount: 200000,
      from: '2024-01',
      to: '2025-01', // not in mock — falls back to latest (2024-04)
      index: 'construction',
      format: 'text',
    };

    const result = await calculateConstruction(params);

    expect(result.toPeriod).toBe('2024-04');
    expect(result.indexedAmount).toBe(206055);
  });

  it('throws when from period is not available', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);

    const params: CalcParams = {
      amount: 100000,
      from: '2020-01', // not in mock
      to: '2024-04',
      index: 'construction',
      format: 'text',
    };

    await expect(calculateConstruction(params)).rejects.toThrow(
      'Construction index data not available for period: 2020-01',
    );
  });

  it('uses CBS calculator result when it has a more recent toPeriod', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    vi.spyOn(cbsCalc, 'fetchCbsCalculation').mockResolvedValue({
      fromPeriod: '2024-01',
      toPeriod: '2024-06',
      fromValue: 200.0,
      toValue: 212.0,
      originalAmount: 100000,
      indexedAmount: 106000,
      difference: 6000,
      percentage: 6.0,
      formatted: '₪106,000 / 6.00%',
    });

    const params: CalcParams = {
      amount: 100000,
      from: '2024-01',
      to: '2024-06',
      index: 'construction',
      format: 'text',
    };

    const result = await calculateConstruction(params);
    expect(result.toPeriod).toBe('2024-06');
    expect(result.indexedAmount).toBe(106000);
  });

  it('returns correctly formatted result string', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);

    const params: CalcParams = {
      amount: 400000,
      from: '2024-02',
      to: '2024-03',
      index: 'construction',
      format: 'text',
    };

    const result = await calculateConstruction(params);

    // multiplier = 1.015
    expect(result.indexedAmount).toBe(406000);
    expect(result.formatted).toMatch(/^₪\d[\d,]+ \/ [\d.]+%$/);
  });

  it('throws when both approaches fail', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockRejectedValue(new Error('network error'));

    const params: CalcParams = {
      amount: 100000,
      from: '2024-01',
      to: '2024-04',
      index: 'construction',
      format: 'text',
    };

    await expect(calculateConstruction(params)).rejects.toThrow('Construction calculation failed');
  });
});
