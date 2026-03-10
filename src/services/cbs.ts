import { CbsApiResponse, CbsIndexEntry, IndexType, INDEX_IDS } from '../types/index.js';

const CBS_BASE_URL = 'https://api.cbs.gov.il/index/data/price';
const TIMEOUT_MS = 10_000;

interface DataSource {
  label: string;
  url: string;
}

/**
 * Multiple source URLs per index.
 * All fetched concurrently; the one with the most recent data wins.
 * Add new sources here as they become available — no other files need to change.
 */
const SOURCES: Record<IndexType, DataSource[]> = {
  cpi: [
    { label: 'cbs-last60', url: cbsUrl(INDEX_IDS.cpi, 60) },
    { label: 'cbs-page100', url: cbsPagedUrl(INDEX_IDS.cpi, 100) },
  ],
  construction: [
    { label: 'cbs-last60', url: cbsUrl(INDEX_IDS.construction, 60) },
    { label: 'cbs-page100', url: cbsPagedUrl(INDEX_IDS.construction, 100) },
  ],
  housing: [
    { label: 'cbs-last60', url: cbsUrl(INDEX_IDS.housing, 60) },
    { label: 'cbs-page100', url: cbsPagedUrl(INDEX_IDS.housing, 100) },
  ],
};

function cbsUrl(id: number, last: number): string {
  return `${CBS_BASE_URL}?id=${id}&last=${last}&format=json&lang=en&download=false`;
}

function cbsPagedUrl(id: number, pageSize: number): string {
  return `${CBS_BASE_URL}?id=${id}&Page=1&PageSize=${pageSize}&format=json&lang=en&download=false`;
}

/**
 * Fetches a single source URL with timeout.
 */
async function fetchSource(source: DataSource): Promise<CbsIndexEntry[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'curl/8.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw: unknown = await response.json();
    return parseCbsResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${source.label}] ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches index data from all configured sources concurrently.
 * Returns the dataset with the most recent entry.
 * Throws only if every source fails.
 */
export async function fetchIndexData(indexType: IndexType): Promise<CbsIndexEntry[]> {
  const sources = SOURCES[indexType];
  const results = await Promise.allSettled(sources.map(fetchSource));

  const errors: string[] = [];
  let best: CbsIndexEntry[] | null = null;

  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(String(result.reason));
      continue;
    }
    const entries = result.value;
    if (!best) {
      best = entries;
      continue;
    }
    // Pick whichever dataset has the more recent latest entry
    const bestPeriod = latestEntry(best)?.period ?? '';
    const currentPeriod = latestEntry(entries)?.period ?? '';
    if (currentPeriod > bestPeriod) {
      best = entries;
    }
  }

  if (!best) {
    throw new Error(`All sources failed for "${indexType}":\n${errors.join('\n')}`);
  }

  return best;
}

/**
 * Parses the raw CBS API response and returns normalised entries sorted ascending.
 */
function parseCbsResponse(raw: unknown): CbsIndexEntry[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Unexpected response format');
  }

  const data = raw as CbsApiResponse;
  if (!Array.isArray(data.month) || data.month.length === 0) {
    throw new Error('Missing month array');
  }

  const first = data.month[0];
  if (!first || !Array.isArray(first.date)) {
    throw new Error('Missing date array');
  }

  const entries: CbsIndexEntry[] = first.date
    .filter((item) => item.currBase && !isNaN(item.currBase.value))
    .map((item) => ({
      period: `${item.year}-${String(item.month).padStart(2, '0')}`,
      value: item.currBase.value,
      monthlyPercent: item.percent,
    }));

  entries.sort((a, b) => a.period.localeCompare(b.period));
  return entries;
}

/**
 * Finds the index entry for a given YYYY-MM period.
 */
export function findEntry(entries: CbsIndexEntry[], period: string): CbsIndexEntry | undefined {
  return entries.find((e) => e.period === period);
}

/**
 * Returns the latest (most recent) entry from a sorted array.
 */
export function latestEntry(entries: CbsIndexEntry[]): CbsIndexEntry | undefined {
  return entries[entries.length - 1];
}
