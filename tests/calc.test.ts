import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as cbs from '../src/services/cbs.js';

const MOCK_ENTRIES = [
  { period: '2024-01', value: 100.0, monthlyPercent: 0.0 },
  { period: '2024-02', value: 101.5, monthlyPercent: 1.5 },
  { period: '2024-03', value: 103.0, monthlyPercent: 1.5 },
];

// Mock environment for Hono bindings
function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

// Create a fake environment with the secret
const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const req = makeRequest('/health');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('ok');
  });
});

describe('GET /calc - auth middleware misconfiguration', () => {
  it('returns 500 when SECRET_KEY is not configured', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01&secret=anything');
    const res = await app.fetch(req, { ENVIRONMENT: 'test' }); // no SECRET_KEY
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringContaining('SECRET_KEY'));
  });
});

describe('GET /calc - auth', () => {
  it('returns 401 without secret', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01&secret=wrong');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('accepts secret via Authorization header', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03', {
      Authorization: 'Bearer test-secret',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
  });
});

describe('GET /calc - validation', () => {
  it('returns 400 for missing amount', async () => {
    const req = makeRequest('/calc?from=2024-01&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/amount/i));
  });

  it('returns 400 for invalid from date', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-13&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/from/i));
  });

  it('returns 400 when from >= to', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-03&to=2024-01&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/from.*to/i));
  });
});

describe('GET /calc - text response', () => {
  it('returns plain text result for valid request', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    // Two lines: indexed amount (integer) then percentage as decimal fraction (4dp, e.g. 0.0302)
    expect(text).toMatch(/^\d+\n0\.\d{4}$/);
  });

  it('sets Cache-Control: no-store', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /calc - JSON response', () => {
  it('returns JSON when Accept is application/json without format query', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03&secret=test-secret', {
      Accept: 'application/json',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('indexedAmount', 103022);
  });

  it('returns full CalcResult object when format=json', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest(
      '/calc?amount=100000&from=2024-01&to=2024-03&format=json&secret=test-secret',
    );
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    // multiplier = 1.015 * 1.015 = 1.030225 → 103022, 3.02%
    expect(body).toHaveProperty('indexedAmount', 103022);
    expect(body).toHaveProperty('percentage', 3.02);
    expect(body).toHaveProperty('formatted', '₪103,022 / 3.02%');
    expect(body).toHaveProperty('fromPeriod', '2024-01');
    expect(body).toHaveProperty('toPeriod', '2024-03');
  });
});

describe('GET /', () => {
  it('returns HTML calculator UI', async () => {
    const req = makeRequest('/?key=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Index Calculator');
    expect(html).not.toContain('test-secret');
    expect(res.headers.get('set-cookie')).toContain('icp_session=');
  });
});

describe('GET /calc - known index', () => {
  it('matches the HON dwelling example using the CBS release available to HON', async () => {
    const fetchData = vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue([
      { period: '2023-11', value: 558.0, monthlyPercent: 0.6 },
      { period: '2026-06', value: 594.8, monthlyPercent: 0.2 },
    ]);
    const req = makeRequest(
      '/calc?amount=3995000&from=2024-02&to=2026-11&index=housing&basis=known&format=json&secret=test-secret',
    );
    const res = await app.fetch(req, env);

    expect(fetchData).toHaveBeenCalledWith('housing', { from: '2023-03', to: '2026-08' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      fromPeriod: '2023-11',
      toPeriod: '2026-06',
      indexedAmount: 4258470,
      percentage: 6.59,
    });
  });

  it('resolves a district series dynamically and uses its CBS observations', async () => {
    const fetchData = vi.fn().mockImplementation(async (url: string) => {
      const endpoint = new URL(url);
      if (endpoint.pathname.endsWith('/catalog/subject')) {
        expect(endpoint.searchParams.get('id')).toBe('166');
        return Response.json({
          subjectId: 166,
          code: [
            { code: 1, codeName: 'Southern District' },
            { code: 2, codeName: 'Central District' },
          ],
        });
      }
      expect(endpoint.pathname).toBe('/index/data/price');
      expect(endpoint.searchParams.get('id')).toBe('2');
      expect(endpoint.searchParams.get('endPeriod')).toBe('06-2026');
      return Response.json({
        month: [
          {
            code: 2,
            date: [
              { year: 2023, month: 11, currBase: { value: 573.5 } },
              { year: 2026, month: 6, currBase: { value: 584.5 } },
            ],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchData);
    const cache = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        match: async (key: string) => cache.get(key)?.clone(),
        put: async (key: string, value: Response) => {
          cache.set(key, value);
        },
      },
    });

    const req = makeRequest(
      '/calc?amount=3995000&from=2024-02&to=2026-09&index=housing&region=central&format=json&secret=test-secret',
    );
    const res = await app.fetch(req, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.json()).toMatchObject({
      fromPeriod: '2023-11',
      toPeriod: '2026-06',
      percentage: 1.92,
    });
    const repeated = await app.fetch(req, env);
    expect(repeated.status).toBe(200);
    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(new URL(fetchData.mock.calls[1]?.[0] as string).searchParams.get('startPeriod')).toBe(
      '03-2023',
    );

    const direct = makeRequest(
      '/calc?amount=3995000&from=2023-11&to=2026-06&index=housing&region=central&basis=period&format=json&secret=test-secret',
    );
    const directResponse = await app.fetch(direct, env);
    expect(directResponse.status).toBe(200);
    expect(await directResponse.json()).toMatchObject({
      fromPeriod: '2023-11',
      toPeriod: '2026-06',
    });
    expect(new URL(fetchData.mock.calls[2]?.[0] as string).searchParams.get('startPeriod')).toBe(
      '11-2023',
    );
  });

  it('lists the choices when the region is invalid', async () => {
    const req = makeRequest(
      '/calc?amount=1&from=2024-02&index=housing&region=bad&secret=test-secret',
    );
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Choose a housing region: jerusalem, north, haifa, central, tel aviv, south.',
    });
  });
});
