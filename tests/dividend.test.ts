import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../src/index.js';
import * as divService from '../src/services/dividend.js';
import { fetchDividend } from '../src/services/dividend.js';
import type { DividendResult } from '../src/types/dividend.js';

const MOCK_DIV = {
  id: 'AAPL',
  currency: 'USD',
  amount: 0.27,
  nextDate: '2026-11-10',
  lastAmount: 0.27,
  lastDate: '2026-08-10',
  isEstimate: true,
  source: 'yahoo-chart',
};

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function yfChartDivResponse(dividends: Record<string, number>, currency = 'USD'): object {
  return {
    chart: {
      result: [
        {
          meta: { currency },
          events: {
            dividends: Object.fromEntries(
              Object.entries(dividends).map(([iso, amount]) => [
                String(Math.floor(new Date(`${iso}T00:00:00.000Z`).getTime() / 1000)),
                { amount },
              ]),
            ),
          },
        },
      ],
    },
  };
}

describe('fetchDividend', () => {
  it('rejects TASE numeric ids', async () => {
    await expect(fetchDividend('1150572')).rejects.toThrow(/not supported/i);
  });

  it('uses announced future dividend from chart', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('query2.finance.yahoo.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify(yfChartDivResponse({ '2025-08-10': 0.24, '2026-11-10': 0.27 })),
            { status: 200 },
          ),
        );
      }
      if (u.includes('r.jina.ai')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: '' } }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const result = await fetchDividend('aapl');
    expect(result).toMatchObject({
      id: 'AAPL',
      amount: 0.27,
      nextDate: '2026-11-10',
      isEstimate: false,
      source: 'yahoo-chart',
    });
  });

  it('projects next date from past payments when none scheduled', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('query2.finance.yahoo.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              yfChartDivResponse({
                '2025-02-10': 0.25,
                '2025-05-10': 0.25,
                '2025-08-10': 0.25,
              }),
            ),
            { status: 200 },
          ),
        );
      }
      if (u.includes('r.jina.ai')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: '' } }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const result = await fetchDividend('MSFT');
    expect(result.isEstimate).toBe(true);
    expect(result.nextDate).toBe('2026-08-13');
    expect(result.amount).toBe(0.25);
  });

  it('prefers Jina ex-dividend date when in the future', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('query2.finance.yahoo.com')) {
        return Promise.resolve(
          new Response(JSON.stringify(yfChartDivResponse({ '2025-08-10': 0.27 })), { status: 200 }),
        );
      }
      if (u.includes('r.jina.ai')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { content: 'Ex-Dividend Date Aug 12, 2026\nAmount 0.27' },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const result = await fetchDividend('AAPL');
    expect(result.nextDate).toBe('2026-08-12');
    expect(result.isEstimate).toBe(false);
    expect(result.source).toBe('yahoo-chart+jina');
  });
});

describe('GET /dividend', () => {
  it('returns amount as text by default', async () => {
    vi.spyOn(divService, 'fetchDividend').mockResolvedValue(MOCK_DIV);
    const res = await app.fetch(makeRequest('/dividend?id=AAPL&secret=test-secret'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('0.27');
  });

  it('returns next date with part=date', async () => {
    vi.spyOn(divService, 'fetchDividend').mockResolvedValue(MOCK_DIV);
    const res = await app.fetch(
      makeRequest('/dividend?id=AAPL&format=text&part=date&secret=test-secret'),
      env,
    );
    expect(await res.text()).toBe('2026-11-10');
  });

  it('returns JSON payload', async () => {
    vi.spyOn(divService, 'fetchDividend').mockResolvedValue(MOCK_DIV);
    const res = await app.fetch(
      makeRequest('/dividend?id=AAPL&format=json&secret=test-secret'),
      env,
    );
    const body = (await res.json()) as DividendResult;
    expect(body.nextDate).toBe('2026-11-10');
    expect(body.amount).toBe(0.27);
  });

  it('returns 400 when id is missing', async () => {
    const res = await app.fetch(makeRequest('/dividend?secret=test-secret'), env);
    expect(res.status).toBe(400);
  });

  it('returns 404 when service throws not found', async () => {
    vi.spyOn(divService, 'fetchDividend').mockRejectedValue(new Error('No dividends for "ZZZZ".'));
    const res = await app.fetch(makeRequest('/dividend?id=ZZZZ&secret=test-secret'), env);
    expect(res.status).toBe(404);
  });
});
