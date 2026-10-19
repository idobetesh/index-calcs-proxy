import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as cbs from '../src/services/cbs.js';

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

function makeRequest(path: string): Request {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}secret=test-secret`);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /latest', () => {
  it('returns latest YYYY-MM period per CBS index type', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockImplementation(async (indexType) => {
      const periods: Record<string, string> = {
        cpi: '2025-08',
        construction: '2025-07',
        housing: '2025-06',
      };
      const period = periods[indexType] ?? '2025-01';
      return [{ period, value: 100, monthlyPercent: 0 }];
    });

    const res = await app.fetch(makeRequest('/latest'), env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      cpi: '2025-08',
      construction: '2025-07',
      housing: '2025-06',
    });
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('returns 401 without secret', async () => {
    const res = await app.fetch(new Request('http://localhost/latest'), env);
    expect(res.status).toBe(401);
  });
});
