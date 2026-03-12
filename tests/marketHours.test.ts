import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import {
  getMarketStatus,
  getAllMarketStatuses,
  MARKETS,
  clearHolidayCache,
} from '../src/services/marketHours.js';

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

function makeRequest(path: string): Request {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}secret=test-secret`);
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearHolidayCache();
});

// ── Route tests ───────────────────────────────────────────────────────────────

describe('GET /market-status (no params)', () => {
  it('returns 200 with all 4 keys + asOf', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/market-status'), env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('tase');
    expect(data).toHaveProperty('lse');
    expect(data).toHaveProperty('nyse');
    expect(data).toHaveProperty('six');
    expect(data).toHaveProperty('asOf', expect.any(String));
  });
});

describe('GET /market-status?market=tase', () => {
  it('returns 200 with single market JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/market-status?market=tase'), env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('key', 'tase');
    expect(data).toHaveProperty('open');
    expect(data).toHaveProperty('localTime');
    expect(data).toHaveProperty('flag');
  });
});

describe('GET /market-status?market=tase&format=text', () => {
  it('returns 200 text/plain with "true" or "false"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/market-status?market=tase&format=text'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(['true', 'false']).toContain(body);
  });
});

describe('GET /market-status?market=invalid', () => {
  it('returns 400 with error field', async () => {
    const res = await app.fetch(makeRequest('/market-status?market=invalid'), env);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });
});

// ── TASE trading window ────────────────────────────────────────────────────────

describe('TASE trading window', () => {
  // TASE moved to Mon–Fri on 2023-09-10. 2024-03-11 is a Monday, UTC+2.
  it('open: Monday 10:00 Jerusalem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    // Monday 08:00 UTC = 10:00 Jerusalem (UTC+2)
    const now = new Date('2024-03-11T08:00:00Z');
    const status = await getMarketStatus(MARKETS.tase, now);
    expect(status.open).toBe(true);
  });

  it('closed: Sunday (day 0)', async () => {
    // 2024-03-10 is a Sunday — no longer a trading day since Sep 2023.
    const now = new Date('2024-03-10T08:00:00Z');
    const status = await getMarketStatus(MARKETS.tase, now);
    expect(status.open).toBe(false);
  });

  it('closed: before 09:59 local', async () => {
    // Monday 07:00 UTC = 09:00 Jerusalem — before 09:59 open
    const now = new Date('2024-03-11T07:00:00Z');
    const status = await getMarketStatus(MARKETS.tase, now);
    expect(status.open).toBe(false);
  });

  it('closed: after 17:25 local', async () => {
    // Monday 16:00 UTC = 18:00 Jerusalem — after 17:25 close
    const now = new Date('2024-03-11T16:00:00Z');
    const status = await getMarketStatus(MARKETS.tase, now);
    expect(status.open).toBe(false);
  });
});

// ── NYSE DST ─────────────────────────────────────────────────────────────────

describe('NYSE DST handling', () => {
  // Summer (EDT = UTC-4): 2024-07-01 Monday 13:30 UTC = 09:30 EDT → open
  it('open at 09:30 in summer (UTC-4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const now = new Date('2024-07-01T13:30:00Z');
    const status = await getMarketStatus(MARKETS.nyse, now);
    expect(status.open).toBe(true);
  });

  // Winter (EST = UTC-5): 2024-01-08 Monday 14:30 UTC = 09:30 EST → open
  it('open at 09:30 in winter (UTC-5)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const now = new Date('2024-01-08T14:30:00Z');
    const status = await getMarketStatus(MARKETS.nyse, now);
    expect(status.open).toBe(true);
  });
});

// ── Holiday detection ─────────────────────────────────────────────────────────

describe('Holiday detection', () => {
  it('returns open:false when date is a holiday', async () => {
    // 2024-07-04 is US Independence Day (Thursday). UTC-4 = 13:30 UTC → 09:30 EDT (within window)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ date: '2024-07-04' }]), { status: 200 }),
    );
    const now = new Date('2024-07-04T13:30:00Z');
    const status = await getMarketStatus(MARKETS.nyse, now);
    expect(status.open).toBe(false);
  });
});

// ── Holiday graceful degradation ──────────────────────────────────────────────

describe('Holiday graceful degradation', () => {
  it('returns open:true when Nager returns 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Server Error', { status: 500 }));
    const now = new Date('2024-07-01T13:30:00Z'); // Monday, within NYSE window
    const status = await getMarketStatus(MARKETS.nyse, now);
    expect(status.open).toBe(true);
  });

  it('returns open:true when fetch throws (network/timeout)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AbortError'));
    const now = new Date('2024-07-01T13:30:00Z');
    const status = await getMarketStatus(MARKETS.nyse, now);
    expect(status.open).toBe(true);
  });
});

// ── Holiday cache ─────────────────────────────────────────────────────────────

describe('Holiday cache', () => {
  it('only calls Nager once for the same year+country', async () => {
    const mockFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const now1 = new Date('2024-07-01T13:30:00Z');
    const now2 = new Date('2024-07-02T13:30:00Z'); // next day, same year+country
    await getMarketStatus(MARKETS.nyse, now1);
    await getMarketStatus(MARKETS.nyse, now2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── getAllMarketStatuses shape ─────────────────────────────────────────────────

describe('getAllMarketStatuses', () => {
  it('returns all 4 markets and asOf', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const now = new Date('2024-07-01T13:30:00Z');
    const result = await getAllMarketStatuses(now);
    expect(result.tase).toBeDefined();
    expect(result.lse).toBeDefined();
    expect(result.nyse).toBeDefined();
    expect(result.six).toBeDefined();
    expect(result.asOf).toBe(now.toISOString());
  });
});
