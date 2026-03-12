import { BoiSdmxResponse, RateResult } from '../types/rate.js';
import { fetchWithTimeout } from '../utils/fetch.js';

// BOI SDMX v2 — monetary policy (Bank Rate) dataflow, nominal interest rate series
const BOI_RATE_URL =
  'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0' +
  '?format=sdmx-json&lastNObservations=1&c%5BSERIES_CODE%5D=MNT_RIB_BOI_D';

export async function fetchBoiRate(): Promise<RateResult> {
  const res = await fetchWithTimeout(BOI_RATE_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
  });
  if (!res.ok) throw new Error(`BOI API returned HTTP ${res.status}`);

  const json: BoiSdmxResponse = await res.json();

  const dataSet = json.data.dataSets[0];
  if (!dataSet) throw new Error('BOI response: no dataSets');

  const seriesEntry = Object.values(dataSet.series)[0];
  if (!seriesEntry) throw new Error('BOI response: no series');

  const obsEntries = Object.entries(seriesEntry.observations);
  if (obsEntries.length === 0) throw new Error('BOI response: no observations');

  // obsEntries: [["0", ["4", 0]], ...]
  const firstObs = obsEntries[0];
  if (!firstObs) throw new Error('BOI response: empty observations');
  const [obsIndex, obsValue] = firstObs;
  const rate = parseFloat(obsValue[0]);
  if (isNaN(rate)) throw new Error(`BOI response: unparseable rate value "${obsValue[0]}"`);

  const timeDimension = json.data.structure.dimensions.observation[0];
  if (!timeDimension) throw new Error('BOI response: no time dimension');

  const effectiveDate = timeDimension.values[parseInt(obsIndex, 10)]?.id ?? '';

  return { rate, effectiveDate, asOf: new Date().toISOString() };
}
