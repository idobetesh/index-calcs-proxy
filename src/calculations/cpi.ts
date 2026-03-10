import { CalcParams, CalcResult } from '../types/index.js';
import { fetchIndexData, findEntry, latestEntry } from '../services/cbs.js';
import { fetchCbsCalculation } from '../services/cbsCalculator.js';
import { formatResult } from '../utils/format.js';

/**
 * Calculates CPI-linked index adjustment.
 *
 * Runs two approaches concurrently:
 *  1. Chaining monthly percent changes from the CBS price series (handles base-year rebasings)
 *  2. CBS official calculator API (uses CBS's own chaining coefficients)
 *
 * Returns whichever yields the more recent toPeriod.
 * Falls back to whichever succeeds if one source fails.
 */
export async function calculateCpi(params: CalcParams): Promise<CalcResult> {
  const [chainingResult, calculatorResult] = await Promise.allSettled([
    chainingCalc(params),
    fetchCbsCalculation('cpi', params),
  ]);

  return pickBest(chainingResult, calculatorResult, 'CPI');
}

async function chainingCalc(params: CalcParams): Promise<CalcResult> {
  const entries = await fetchIndexData('cpi');

  const fromEntry = findEntry(entries, params.from);
  if (!fromEntry) throw new Error(`CPI data not available for period: ${params.from}`);

  const toEntry = findEntry(entries, params.to) ?? latestEntry(entries);
  if (!toEntry) throw new Error('CPI data: no entries available');

  const fromIdx = entries.indexOf(fromEntry);
  const toIdx = entries.indexOf(toEntry);

  let multiplier = 1;
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const entry = entries[i];
    if (entry) multiplier *= 1 + entry.monthlyPercent / 100;
  }

  const indexedAmount = Math.round(params.amount * multiplier);
  const difference = indexedAmount - params.amount;
  const percentage = (multiplier - 1) * 100;

  return {
    fromPeriod: fromEntry.period,
    toPeriod: toEntry.period,
    fromValue: fromEntry.value,
    toValue: toEntry.value,
    originalAmount: params.amount,
    indexedAmount,
    difference,
    percentage: Math.round(percentage * 100) / 100,
    formatted: formatResult(indexedAmount, percentage),
  };
}

/**
 * Returns the result with the more recent toPeriod.
 * Prefers the chaining result on tie (more granular data).
 */
function pickBest(
  a: PromiseSettledResult<CalcResult>,
  b: PromiseSettledResult<CalcResult>,
  label: string,
): CalcResult {
  const aVal = a.status === 'fulfilled' ? a.value : null;
  const bVal = b.status === 'fulfilled' ? b.value : null;

  if (aVal && bVal) {
    return bVal.toPeriod > aVal.toPeriod ? bVal : aVal;
  }
  if (aVal) return aVal;
  if (bVal) return bVal;

  const reason =
    a.status === 'rejected' ? String(a.reason) : String((b as PromiseRejectedResult).reason);
  throw new Error(`${label} calculation failed: ${reason}`);
}
