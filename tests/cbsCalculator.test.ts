import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCbsCalculation } from '../src/services/cbsCalculator.js';
import { CalcParams } from '../src/types/calc.js';

const BASE_PARAMS: CalcParams = {
  amount: 100000,
  from: '2024-01',
  to: '2024-04',
  index: 'cpi',
  format: 'text',
};

const MOCK_ANSWER = {
  from_value: 100000,
  to_value: 103028,
  from_index_date: '2024-1', // CBS returns single-digit months
  to_index_date: '2024-4',
  from_index_value: 100.0,
  to_index_value: 103.0,
  chaining_coefficient: 1.03,
  change_percent: 3.028,
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchCbsCalculation', () => {
  it('returns CalcResult with normalised periods on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ request: {}, answer: MOCK_ANSWER })),
    );

    const result = await fetchCbsCalculation('cpi', BASE_PARAMS);

    expect(result.indexedAmount).toBe(103028);
    expect(result.fromPeriod).toBe('2024-01'); // zero-padded from '2024-1'
    expect(result.toPeriod).toBe('2024-04'); // zero-padded from '2024-4'
    expect(result.percentage).toBe(3.03); // Math.round(3.028 * 100) / 100
    expect(result.originalAmount).toBe(100000);
    expect(result.difference).toBe(3028);
  });

  it('normalises bimonthly housing periods (e.g. "2025-9/2025-8") to latest month', async () => {
    const housingAnswer = { ...MOCK_ANSWER, to_index_date: '2025-8/2025-9' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ request: {}, answer: housingAnswer })),
    );

    const result = await fetchCbsCalculation('housing', {
      ...BASE_PARAMS,
      index: 'housing',
      to: '2025-09',
    });

    expect(result.toPeriod).toBe('2025-09');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(fetchCbsCalculation('cpi', BASE_PARAMS)).rejects.toThrow('[cbs-calculator]');
  });

  it('throws on malformed response (missing answer)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ request: {} })));
    await expect(fetchCbsCalculation('cpi', BASE_PARAMS)).rejects.toThrow(
      'Unexpected CBS calculator response format',
    );
  });

  it('throws when CBS snaps fromPeriod earlier than requested', async () => {
    const snappedAnswer = { ...MOCK_ANSWER, from_index_date: '2023-12' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ request: {}, answer: snappedAnswer })),
    );

    await expect(fetchCbsCalculation('cpi', BASE_PARAMS)).rejects.toThrow('snapped fromPeriod');
  });
});
