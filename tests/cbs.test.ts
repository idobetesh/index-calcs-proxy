import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchIndexData, findEntry, latestEntry } from '../src/services/cbs.js';

// Builds a CBS API response payload from a flat list of entries.
function cbsResponse(
  entries: Array<{ year: number; month: number; percent: number; value: number }>,
): object {
  return {
    month: [
      {
        code: 120010,
        date: entries.map((e) => ({
          year: e.year,
          month: e.month,
          percent: e.percent,
          currBase: { value: e.value },
        })),
      },
    ],
  };
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ENTRIES_A = [
  { year: 2024, month: 1, percent: 0.0, value: 100.0 },
  { year: 2024, month: 3, percent: 1.5, value: 101.5 },
];

const ENTRIES_B = [
  ...ENTRIES_A,
  { year: 2024, month: 6, percent: 0.8, value: 102.3 }, // more recent
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── findEntry ─────────────────────────────────────────────────────────────────

describe('findEntry', () => {
  const entries = [
    { period: '2024-01', value: 100, monthlyPercent: 0 },
    { period: '2024-02', value: 101, monthlyPercent: 1 },
  ];

  it('returns matching entry', () => {
    expect(findEntry(entries, '2024-01')).toEqual(entries[0]);
  });

  it('returns undefined when period not found', () => {
    expect(findEntry(entries, '2024-05')).toBeUndefined();
  });
});

// ── latestEntry ───────────────────────────────────────────────────────────────

describe('latestEntry', () => {
  it('returns the last entry', () => {
    const entries = [
      { period: '2024-01', value: 100, monthlyPercent: 0 },
      { period: '2024-02', value: 101, monthlyPercent: 1 },
    ];
    expect(latestEntry(entries)).toEqual(entries[1]);
  });

  it('returns undefined for empty array', () => {
    expect(latestEntry([])).toBeUndefined();
  });
});

// ── fetchIndexData ─────────────────────────────────────────────────────────────

describe('fetchIndexData', () => {
  it('returns parsed and sorted entries on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(cbsResponse(ENTRIES_A))));

    const entries = await fetchIndexData('cpi');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ period: '2024-01', value: 100.0, monthlyPercent: 0.0 });
    expect(entries[1]).toMatchObject({ period: '2024-03', value: 101.5 });
  });

  it('picks the source with the most recent entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const data = url.includes('last=60') ? ENTRIES_A : ENTRIES_B;
        return Promise.resolve(jsonResponse(cbsResponse(data)));
      }),
    );

    const entries = await fetchIndexData('cpi');
    expect(latestEntry(entries)?.period).toBe('2024-06');
  });

  it('returns data from the working source when one source fails', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(new Response('error', { status: 500 }));
        return Promise.resolve(jsonResponse(cbsResponse(ENTRIES_A)));
      }),
    );

    const entries = await fetchIndexData('cpi');
    expect(entries).toHaveLength(2);
  });

  it('throws when all sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));
    await expect(fetchIndexData('cpi')).rejects.toThrow('All sources failed for "cpi"');
  });

  it('throws when response has empty month array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ month: [] })));
    await expect(fetchIndexData('cpi')).rejects.toThrow();
  });

  it('throws when response is not an object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(null), { status: 200 })),
    );
    await expect(fetchIndexData('cpi')).rejects.toThrow();
  });

  it('filters out entries with null currBase', async () => {
    // NaN is not tested here: JSON.stringify(NaN) → null, and isNaN(null) → false,
    // so NaN values pass the filter undetected (dead-code path in production).
    const responseWithBadEntries = {
      month: [
        {
          code: 120010,
          date: [
            { year: 2024, month: 1, percent: 0.0, currBase: { value: 100.0 } }, // valid
            { year: 2024, month: 2, percent: 1.0, currBase: null }, // null currBase — filtered
            { year: 2024, month: 3, percent: 1.5, currBase: null }, // null currBase — filtered
            { year: 2024, month: 4, percent: 0.5, currBase: { value: 103.0 } }, // valid
          ],
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(responseWithBadEntries)));
    const entries = await fetchIndexData('cpi');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.period).toBe('2024-01');
    expect(entries[1]?.period).toBe('2024-04');
  });
});

it.each([
  ['cpi', '120010'],
  ['construction', '200010'],
  ['housing', '40010'],
] as const)(
  'requests the historical range for %s from the correct CBS series',
  async (index, id) => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(cbsResponse(ENTRIES_A)));
    vi.stubGlobal('fetch', mockFetch);

    await fetchIndexData(index, { from: '2020-12', to: '2026-08' });

    const url = new URL(mockFetch.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('id')).toBe(id);
    expect(url.searchParams.get('startPeriod')).toBe('12-2020');
    expect(url.searchParams.get('endPeriod')).toBe('08-2026');
    expect(url.searchParams.has('last')).toBe(false);
  },
);

it('uses five-hour freshness for recent observations and a day for fixed history', async () => {
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn<(key: string, response: Response) => Promise<void>>().mockResolvedValue(undefined),
  };
  vi.stubGlobal('caches', { default: cache });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => jsonResponse(cbsResponse(ENTRIES_A))),
  );

  await fetchIndexData('cpi', { from: '2024-01', to: '2024-03' });
  await fetchIndexData('construction', { from: '2024-01', to: '2099-01' });
  await fetchIndexData('housing');

  const headers = cache.put.mock.calls.map(([, response]: [string, Response]) =>
    response.headers.get('Cache-Control'),
  );
  expect(headers).toEqual(['max-age=86400', 'max-age=18000', 'max-age=18000', 'max-age=18000']);
});
