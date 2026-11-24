import { CbsIndexEntry } from '../types/cbs.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { fetchIndexRange } from './cbs.js';

export const HOUSING_DISTRICTS = [
  'jerusalem',
  'north',
  'haifa',
  'central',
  'tel aviv',
  'south',
] as const;
export type HousingDistrict = (typeof HOUSING_DISTRICTS)[number];

// CBS chapter aa lists subject 166 as Index of Prices of Dwellings by District.
const DISTRICT_CATALOG =
  'https://api.cbs.gov.il/index/catalog/subject?id=166&format=json&download=false&lang=en';

const DISTRICT_NAMES: Record<HousingDistrict, RegExp> = {
  jerusalem: /\bjerusalem\b/i,
  north: /\bnorth(?:ern)?\b/i,
  haifa: /\bhaifa\b/i,
  central: /\b(?:central|cent(?:er|re))\b/i,
  'tel aviv': /\btel[\s-]+aviv\b/i,
  south: /\bsouth(?:ern)?\b/i,
};

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

type Cached<T> = { value: T; expiresAt: number };

const districtCodes = new Map<HousingDistrict, Cached<number>>();

function collectDistrictCodes(value: unknown, label: RegExp, codes: Set<number>): void {
  if (!value || typeof value !== 'object') return;

  const fields = Object.entries(value);
  const hasDistrictName = fields.some(
    ([, field]) => typeof field === 'string' && label.test(field),
  );
  if (hasDistrictName) {
    for (const [name, field] of fields) {
      if (!/^(code|codeId|indexCode)$/i.test(name)) continue;
      if (typeof field !== 'number' && typeof field !== 'string') continue;
      const code = Number(field);
      if (Number.isSafeInteger(code) && code > 0) codes.add(code);
    }
  }

  for (const [, field] of fields) collectDistrictCodes(field, label, codes);
}

async function fetchDistrictCode(district: HousingDistrict): Promise<number> {
  const cached = districtCodes.get(district);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetchWithTimeout(DISTRICT_CATALOG, {
    headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
  });
  if (!response.ok) throw new Error(`CBS district catalog returned HTTP ${response.status}`);

  const codes = new Set<number>();
  collectDistrictCodes(await response.json(), DISTRICT_NAMES[district], codes);
  const [code] = codes;
  if (codes.size !== 1 || code === undefined) {
    throw new Error(`CBS district catalog did not identify one dwelling index for ${district}`);
  }

  districtCodes.set(district, { value: code, expiresAt: Date.now() + CATALOG_TTL_MS });
  return code;
}

export async function fetchDistrictIndexData(
  district: HousingDistrict,
  range: { from: string; to: string },
): Promise<CbsIndexEntry[]> {
  const code = await fetchDistrictCode(district);
  return fetchIndexRange(code, range, 'housing');
}
