import { fetchIndexData } from '../services/cbs.js';
import { fetchDistrictIndexData, HousingDistrict } from '../services/cbsDistricts.js';
import { fetchCbsCalculation } from '../services/cbsCalculator.js';
import { CalcParams, CalcResult } from '../types/calc.js';
import { formatResult, shiftPeriod } from '../utils/format.js';

const PUBLICATION_LAG = { cpi: 2, construction: 2, housing: 3 };

/** Uses HON month cutoffs by default. Period-based district queries use the supplied months. */
export async function calculateKnownIndex(
  params: CalcParams,
  region?: HousingDistrict,
  basis: 'known' | 'period' = 'known',
): Promise<CalcResult> {
  const lag = basis === 'known' ? PUBLICATION_LAG[params.index] : 0;
  const from = shiftPeriod(params.from, -lag);
  const to = shiftPeriod(params.to, -lag);
  // HON checks the target month and up to eight earlier months.
  const earliest = basis === 'known' ? shiftPeriod(from, -8) : from;
  const data = region
    ? await fetchDistrictIndexData(region, { from: earliest, to })
    : await fetchIndexData(params.index, { from: earliest, to });
  const entries = data.filter((entry) => entry.period >= earliest && entry.period <= to);
  const start = entries.filter((entry) => entry.period <= from).at(-1);
  const end = entries.at(-1);

  if (!start || !end || end.period < shiftPeriod(to, -8)) {
    const series = region ? `housing (${region})` : params.index;
    throw new Error(`CBS ${series} data unavailable for periods ${from} through ${to}`);
  }

  // The dwelling price index uses a common base and labels pairs by their first month.
  let multiplier = end.value / start.value;
  if (params.index !== 'housing' && end.period !== start.period) {
    try {
      const official = await fetchCbsCalculation(
        params.index,
        {
          ...params,
          from: shiftPeriod(start.period, lag),
          to: shiftPeriod(end.period, lag),
        },
        { from: start.period, to: end.period },
      );
      return official;
    } catch {
      // Chain the published monthly changes if the calculator cannot resolve these periods.
      multiplier = 1;
      let previous = start.period;
      for (const entry of entries.slice(entries.indexOf(start) + 1)) {
        if (entry.period !== shiftPeriod(previous, 1) || !Number.isFinite(entry.monthlyPercent)) {
          throw new Error(`Incomplete CBS ${params.index} data after ${previous}`);
        }
        multiplier *= 1 + entry.monthlyPercent / 100;
        previous = entry.period;
      }
    }
  }

  const indexedAmount = Math.round(params.amount * multiplier);
  const percentage = (multiplier - 1) * 100;
  return {
    fromPeriod: start.period,
    toPeriod: end.period,
    fromValue: start.value,
    toValue: end.value,
    originalAmount: params.amount,
    indexedAmount,
    difference: indexedAmount - params.amount,
    percentage: Math.round(percentage * 100) / 100,
    formatted: formatResult(indexedAmount, percentage),
  };
}
