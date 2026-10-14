import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import { classifyCnnFearGreedValue } from '../src/services/fearGreed.js';
import type { FearGreedResult } from '../src/types/fearGreed.js';

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

function makeRequest(path: string): Request {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}secret=test-secret`);
}

const MOCK_CRYPTO_FNG = {
  data: [{ value: '62', value_classification: 'Greed' }],
};

const MOCK_CNN = {
  fear_and_greed: { score: 35, rating: 'fear', timestamp: '2026-03-17T12:00:00Z' },
};

const JINA_STOCKS_CONTENT = `fear-and-greed-index)\n\n41\n\nFear\n\n4 points`;
const JINA_CRYPTO_CONTENT = `crypto-fear-and-greed-index)\n\n62\n\nGreed\n\n5 points`;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('classifyCnnFearGreedValue', () => {
  it('uses CNN Business score bands on raw score (stocks only)', () => {
    expect(classifyCnnFearGreedValue(10)).toBe('Extreme Fear');
    expect(classifyCnnFearGreedValue(24.9)).toBe('Extreme Fear');
    expect(classifyCnnFearGreedValue(25)).toBe('Fear');
    expect(classifyCnnFearGreedValue(44)).toBe('Fear');
    expect(classifyCnnFearGreedValue(44.74)).toBe('Fear');
    expect(classifyCnnFearGreedValue(45)).toBe('Neutral');
    expect(classifyCnnFearGreedValue(54.9)).toBe('Neutral');
    expect(classifyCnnFearGreedValue(55)).toBe('Greed');
    expect(classifyCnnFearGreedValue(74.9)).toBe('Greed');
    expect(classifyCnnFearGreedValue(75)).toBe('Extreme Greed');
  });
});

describe('GET /fear-greed', () => {
  it('returns crypto value as text from alternative.me', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('alternative.me')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_CRYPTO_FNG), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=crypto&format=text'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('62');
  });

  it('returns crypto JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('alternative.me')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_CRYPTO_FNG), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=crypto&format=json'), env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as FearGreedResult;
    expect(data).toMatchObject({
      market: 'crypto',
      value: 62,
      rating: 'greed',
      source: 'alternative.me',
    });
    expect(data.timestamp).toEqual(expect.any(String));
  });

  it('falls back to Jina when alternative.me fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('alternative.me')) {
        return Promise.resolve(new Response('error', { status: 500 }));
      }
      if (u.includes('feargreedmeter.com/crypto')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: JINA_CRYPTO_CONTENT } }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=crypto'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('62');
  });

  it('returns stocks from CNN when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('dataviz.cnn.io')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_CNN), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=stocks&format=json'), env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as FearGreedResult;
    expect(data).toMatchObject({ market: 'stocks', value: 35, source: 'cnn' });
    expect(data.rating).toBe('fear');
  });

  it('uses CNN API rating and rounded score (not recomputed label)', async () => {
    const mock = {
      fear_and_greed: {
        score: 44.74,
        rating: 'fear',
        timestamp: '2026-10-14T15:00:15+00:00',
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('dataviz.cnn.io')) {
        return Promise.resolve(new Response(JSON.stringify(mock), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=stocks&format=json'), env);
    const data = (await res.json()) as FearGreedResult;
    expect(data.value).toBe(45);
    expect(data.rating).toBe('fear');
    expect(data.source).toBe('cnn');
  });

  it('falls back to Jina for stocks when CNN blocks', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('dataviz.cnn.io')) {
        return Promise.resolve(new Response("I'm a teapot. You're a bot.", { status: 418 }));
      }
      if (u.includes('r.jina.ai') && u.includes('feargreedmeter.com/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: JINA_STOCKS_CONTENT } }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const res = await app.fetch(makeRequest('/fear-greed?market=stocks'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('41');
  });

  it('returns 400 for invalid market', async () => {
    const res = await app.fetch(makeRequest('/fear-greed?market=forex'), env);
    expect(res.status).toBe(400);
  });

  it('sets Cache-Control max-age=1800', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_CRYPTO_FNG), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/fear-greed?market=crypto'), env);
    expect(res.headers.get('cache-control')).toContain('max-age=1800');
  });
});
