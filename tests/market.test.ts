import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';

const STOOQ_CSV = (symbol: string, open: number, close: number): string =>
  `Symbol,Date,Time,Open,High,Low,Close,Volume\n${symbol},2024-01-15,12:00:00,${open},${close + 10},${open - 10},${close},100000`;

const VIX_CSV = (prevClose: number, close: number): string =>
  `DATE,OPEN,HIGH,LOW,CLOSE\n01/14/2024,15.00,16.00,14.50,${prevClose}\n01/15/2024,15.50,16.50,15.00,${close}`;

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GET /market', () => {
  it('returns all market data with prices and changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('cboe.com')) {
          return Promise.resolve(new Response(VIX_CSV(15.5, 15.8), { status: 200 }));
        }
        return Promise.resolve(new Response(STOOQ_CSV('XAUUSD', 1900, 1920), { status: 200 }));
      }),
    );

    const req = makeRequest('/market?secret=test-secret');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');

    const body: unknown = await res.json();
    expect(body).toHaveProperty('gold.price', 1920);
    expect(body).toHaveProperty('silver.price', 1920);
    expect(body).toHaveProperty('vix.price', 15.8);
    expect(body).toHaveProperty('sp500');
    expect(body).toHaveProperty('nasdaq');
    expect(body).toHaveProperty('russell');
    expect(body).toHaveProperty('msci');
  });

  it('returns null for a market when its source is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('cboe.com') || url.includes('xagusd')) {
          return Promise.resolve(new Response('error', { status: 500 }));
        }
        return Promise.resolve(new Response(STOOQ_CSV('XAUUSD', 1900, 1920), { status: 200 }));
      }),
    );

    const req = makeRequest('/market?secret=test-secret');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('silver', null);
    expect(body).toHaveProperty('vix', null);
    expect(body).toHaveProperty('gold.price', 1920);
  });

  it('returns null for a market when Stooq returns N/D', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('cboe.com')) {
          return Promise.resolve(new Response(VIX_CSV(15.5, 15.8), { status: 200 }));
        }
        const nd = `Symbol,Date,Time,Open,High,Low,Close,Volume\nXAUUSD,N/D,N/D,N/D,N/D,N/D,N/D,N/D`;
        return Promise.resolve(new Response(nd, { status: 200 }));
      }),
    );

    const req = makeRequest('/market?secret=test-secret');
    const res = await app.fetch(req, env);
    const body: unknown = await res.json();

    expect(body).toHaveProperty('gold', null);
  });
});
