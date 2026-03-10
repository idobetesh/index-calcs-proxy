import { CalcParams, CalcResult, INDEX_IDS, IndexType } from '../types/index.js';
import { formatResult } from '../utils/format.js';

const CBS_CALC_BASE = 'https://api.cbs.gov.il/index/data/calculator';
const TIMEOUT_MS = 10_000;

interface CbsCalcAnswer {
  from_value: number;
  to_value: number;
  from_index_date: string; // "YYYY-M" or "YYYY-M/YYYY-M" (housing bimonthly)
  to_index_date: string;
  from_index_value: number;
  to_index_value: number;
  chaining_coefficient: number;
  change_percent: number;
}

interface CbsCalcResponse {
  request: {
    code: number;
    sum: number;
    from_date: string;
    to_date: string;
  };
  answer: CbsCalcAnswer;
}

/**
 * Converts "YYYY-MM" → "MM-01-YYYY" for CBS calculator API.
 */
function periodToApiDate(period: string): string {
  const [year, month] = period.split('-');
  return `${month ?? '01'}-01-${year ?? ''}`;
}

/**
 * Normalises a CBS date string (which may be bimonthly like "2025-9/2025-8")
 * to a canonical "YYYY-MM" period string by taking the later month.
 */
function apiDateToPeriod(apiDate: string): string {
  const parts = apiDate.split('/');
  // Pick the chronologically latest part
  let best = parts[0] ?? apiDate;
  for (const part of parts) {
    const [y1, m1] = best.split('-').map(Number);
    const [y2, m2] = part.split('-').map(Number);
    if ((y2 ?? 0) * 12 + (m2 ?? 0) > (y1 ?? 0) * 12 + (m1 ?? 0)) best = part;
  }
  const [year, month] = best.split('-');
  return `${year ?? ''}-${String(month ?? '').padStart(2, '0')}`;
}

/**
 * Fetches a calculation directly from the CBS official calculator API.
 * The CBS calculator handles base-year chaining internally using official coefficients.
 *
 * Note: CBS snaps from/to dates to the nearest available published period.
 * The returned fromPeriod/toPeriod may differ from the requested params.
 *
 * @throws if the network call fails or the response is malformed.
 */
export async function fetchCbsCalculation(
  indexType: IndexType,
  params: CalcParams,
): Promise<CalcResult> {
  const id = INDEX_IDS[indexType];
  const fromDate = periodToApiDate(params.from);
  const toDate = periodToApiDate(params.to);

  const url =
    `${CBS_CALC_BASE}/${id}?value=${params.amount}` +
    `&date=${fromDate}&toDate=${toDate}` +
    `&format=json&download=false&lang=en`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
    const raw = (await response.json()) as CbsCalcResponse;
    const ans: CbsCalcAnswer = raw?.answer;

    if (!ans || typeof ans.to_value !== 'number' || typeof ans.change_percent !== 'number') {
      throw new Error('Unexpected CBS calculator response format');
    }

    const fromPeriod = apiDateToPeriod(ans.from_index_date);

    // CBS calculator snaps dates to "index available on that date" — due to publication
    // lag this is always earlier than the requested period.  Reject the result so the
    // chaining calculation (which uses the index FOR the requested month) takes over.
    if (fromPeriod < params.from) {
      throw new Error(
        `CBS calculator snapped fromPeriod to ${fromPeriod}, earlier than requested ${params.from}`,
      );
    }

    const toPeriod = apiDateToPeriod(ans.to_index_date);
    const indexedAmount = Math.round(ans.to_value);
    const difference = indexedAmount - params.amount;
    const percentage = Math.round(ans.change_percent * 100) / 100;

    return {
      fromPeriod,
      toPeriod,
      fromValue: ans.from_index_value,
      toValue: ans.to_index_value,
      originalAmount: params.amount,
      indexedAmount,
      difference,
      percentage,
      formatted: formatResult(indexedAmount, percentage),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[cbs-calculator] ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
