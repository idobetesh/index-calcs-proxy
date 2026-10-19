import { fetchIndexData, latestEntry } from './cbs.js';
import { IndexType } from '../types/cbs.js';

const INDEX_TYPES: IndexType[] = ['cpi', 'construction', 'housing'];

export type CbsLatestPeriods = Record<IndexType, string>;

/** Latest published YYYY-MM period per CBS index type. */
export async function fetchCbsLatestPeriods(): Promise<CbsLatestPeriods> {
  const results = await Promise.allSettled(INDEX_TYPES.map((t) => fetchIndexData(t)));

  const out = {} as CbsLatestPeriods;
  const errors: string[] = [];

  results.forEach((result, i) => {
    const indexType = INDEX_TYPES[i];
    if (!indexType) return;
    if (result.status === 'rejected') {
      errors.push(`${indexType}: ${String(result.reason)}`);
      return;
    }
    const latest = latestEntry(result.value);
    if (!latest?.period) {
      errors.push(`${indexType}: no latest period`);
      return;
    }
    out[indexType] = latest.period;
  });

  if (Object.keys(out).length === 0) {
    throw new Error(`Could not load CBS latest periods:\n${errors.join('\n')}`);
  }

  return out;
}
