import { CalcParams, CalcResult } from '../types/index.js';
import { fetchIndexData, findEntry, latestEntry } from '../services/cbs.js';
import { fetchCbsCalculation } from '../services/cbsCalculator.js';
import { formatResult } from '../utils/format.js';

/**
 * Calculates Construction Index adjustment.
 *
 * Runs two approaches concurrently:
 *  1. Chaining monthly percent changes from the CBS price series (handles base-year rebasings)
 *  2. CBS official calculator API (uses CBS's own chaining coefficients)
 *
 * Returns whichever yields the more recent toPeriod.
 */
export async function calculateConstruction(params: CalcParams): Promise<CalcResult> {
  const [chainingResult, calculatorResult] = await Promise.allSettled([
    chainingCalc(params),
    fetchCbsCalculation('construction', params),
  ]);

  return pickBest(chainingResult, calculatorResult, 'Construction');
}

async function chainingCalc(params: CalcParams): Promise<CalcResult> {
  const entries = await fetchIndexData('construction');

  const fromEntry = findEntry(entries, params.from);
  if (!fromEntry) {
    throw new Error(`Construction index data not available for period: ${params.from}`);
  }

  const toEntry = findEntry(entries, params.to) ?? latestEntry(entries);
  if (!toEntry) throw new Error('Construction index data: no entries available');

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
