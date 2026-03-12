import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as etfService from '../src/services/etf.js';

const MOCK_QUOTE = {
  id: '5119466',
  name: 'מחקה מדד S&P 500',
  price: 57615,
  currency: 'ILA' as const,
  date: '2024-03-10',
  source: 'maya-mutual',
};

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /etf - auth', () => {
  it('returns 401 without secret', async () => {
    const req = makeRequest('/etf?id=5119466');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const req = makeRequest('/etf?id=5119466&secret=wrong');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('accepts secret via Authorization header', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockResolvedValue(MOCK_QUOTE);
    const req = makeRequest('/etf?id=5119466', { Authorization: 'Bearer test-secret' });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('GET /etf - validation', () => {
  it('returns 400 when id is missing', async () => {
    const req = makeRequest('/etf?secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/id/i));
  });

  it('returns 400 when id contains letters', async () => {
    const req = makeRequest('/etf?id=abc123&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when id is too short (< 6 digits)', async () => {
    const req = makeRequest('/etf?id=12345&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when id is too long (> 10 digits)', async () => {
    const req = makeRequest('/etf?id=12345678901&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });
});

// ── Text response ─────────────────────────────────────────────────────────────

describe('GET /etf - text response', () => {
  it('returns plain numeric price by default', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockResolvedValue(MOCK_QUOTE);
    const req = makeRequest('/etf?id=5119466&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toBe('57615');
  });

  it('sets Cache-Control: no-store on text response', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockResolvedValue(MOCK_QUOTE);
    const req = makeRequest('/etf?id=5119466&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

// ── JSON response ─────────────────────────────────────────────────────────────

describe('GET /etf - JSON response', () => {
  it('returns full EtfQuote object when format=json', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockResolvedValue(MOCK_QUOTE);
    const req = makeRequest('/etf?id=5119466&format=json&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toMatchObject({
      id: '5119466',
      name: 'מחקה מדד S&P 500',
      price: 57615,
      currency: 'ILA',
      date: '2024-03-10',
      source: 'maya-mutual',
    });
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /etf - upstream errors', () => {
  it('returns 502 when all sources fail', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockRejectedValue(
      new Error('All sources failed for ETF "5119466"'),
    );
    const req = makeRequest('/etf?id=5119466&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringContaining('All sources failed'));
  });

  it('returns 404 with error message when security is not found', async () => {
    vi.spyOn(etfService, 'fetchEtfQuote').mockRejectedValue(
      new Error('Security "9999999" not found. Please check the TASE security number.'),
    );
    const req = makeRequest('/etf?id=9999999&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringContaining('not found'));
  });
});

// ── fetchEtfQuote - fallback logic ────────────────────────────────────────────

describe('fetchEtfQuote - source fallback', () => {
  it('returns first source result on success', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ name: 'Test Fund', purchasePrice: 12345, ratesAsOf: '2024-03-10' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', mockFetch);

    const quote = await etfService.fetchEtfQuote('5119466');
    expect(quote.price).toBe(12345);
    expect(quote.source).toBe('maya-mutual');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to maya-etf when maya-mutual returns 404', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/mutual/')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ name: 'ETF Fund', purchasePrice: 99900, ratesAsOf: '2024-03-10' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    vi.stubGlobal('fetch', mockFetch);

    const quote = await etfService.fetchEtfQuote('1150572');
    expect(quote.price).toBe(99900);
    expect(quote.source).toBe('maya-etf');
    expect(callCount).toBe(2);
  });

  it('throws "not found" error when all sources return 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    await expect(etfService.fetchEtfQuote('0000001')).rejects.toThrow(
      'Security "0000001" not found',
    );
  });

  it('throws aggregated error when sources fail with non-404 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })),
    );

    await expect(etfService.fetchEtfQuote('5119466')).rejects.toThrow('All sources failed');
  });

  it('uses redemptionPrice as fallback when purchasePrice is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ name: 'Fund', redemptionPrice: 55000, ratesAsOf: '2024-03-10' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );

    const quote = await etfService.fetchEtfQuote('5119466');
    expect(quote.price).toBe(55000);
  });
});
