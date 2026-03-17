import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as stockService from '../src/services/stock.js';

const MOCK_STOCK_QUOTE = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  price: 213.49,
  currency: 'USD',
  exchange: 'NasdaqGS',
  date: '2026-03-17',
};

const MOCK_SEARCH_RESULTS = [
  { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NasdaqGS', type: 'EQUITY' },
  { ticker: 'AAPL.BA', name: 'Apple Inc.', exchange: 'Buenos Aires', type: 'EQUITY' },
];

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── /price with ticker symbol ─────────────────────────────────────────────────

describe('GET /price - ticker symbol routing', () => {
  it('calls fetchStockQuote (not fetchTaseQuote) for alpha input', async () => {
    const spy = vi.spyOn(stockService, 'fetchStockQuote').mockResolvedValue(MOCK_STOCK_QUOTE);
    const req = makeRequest('/price?id=AAPL&format=json&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('AAPL');
  });

  it('returns stock quote as JSON', async () => {
    vi.spyOn(stockService, 'fetchStockQuote').mockResolvedValue(MOCK_STOCK_QUOTE);
    const req = makeRequest('/price?id=AAPL&format=json&secret=test-secret');
    const res = await app.fetch(req, env);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'AAPL',
      name: 'Apple Inc.',
      price: 213.49,
      currency: 'USD',
      exchange: 'NasdaqGS',
      source: 'yahoo',
    });
  });

  it('returns plain price as text', async () => {
    vi.spyOn(stockService, 'fetchStockQuote').mockResolvedValue(MOCK_STOCK_QUOTE);
    const req = makeRequest('/price?id=AAPL&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('213.49');
  });

  it('uppercases the ticker before fetching', async () => {
    const spy = vi.spyOn(stockService, 'fetchStockQuote').mockResolvedValue(MOCK_STOCK_QUOTE);
    const req = makeRequest('/price?id=aapl&secret=test-secret');
    await app.fetch(req, env);
    expect(spy).toHaveBeenCalledWith('AAPL');
  });

  it('handles dotted tickers like TEVA.TA', async () => {
    const spy = vi
      .spyOn(stockService, 'fetchStockQuote')
      .mockResolvedValue({ ...MOCK_STOCK_QUOTE, ticker: 'TEVA.TA', currency: 'ILS' });
    const req = makeRequest('/price?id=TEVA.TA&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('TEVA.TA');
  });

  it('returns 404 when ticker is not found', async () => {
    vi.spyOn(stockService, 'fetchStockQuote').mockRejectedValue(
      new Error('Ticker "FAKE" not found. Please check the symbol.'),
    );
    const req = makeRequest('/price?id=FAKE&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringContaining('not found'));
  });

  it('returns 502 when all sources fail', async () => {
    vi.spyOn(stockService, 'fetchStockQuote').mockRejectedValue(
      new Error('All sources failed for "AAPL"'),
    );
    const req = makeRequest('/price?id=AAPL&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(502);
  });
});

// ── /stock/search ─────────────────────────────────────────────────────────────

describe('GET /stock/search', () => {
  it('returns 401 without secret', async () => {
    const req = makeRequest('/stock/search?q=apple');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 400 when q is missing', async () => {
    const req = makeRequest('/stock/search?secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns search results as JSON array', async () => {
    vi.spyOn(stockService, 'searchStocks').mockResolvedValue(MOCK_SEARCH_RESULTS);
    const req = makeRequest('/stock/search?q=apple&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(MOCK_SEARCH_RESULTS);
  });

  it('returns empty array when no results found', async () => {
    vi.spyOn(stockService, 'searchStocks').mockResolvedValue([]);
    const req = makeRequest('/stock/search?q=xyzxyzxyz&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 502 when upstream search fails', async () => {
    vi.spyOn(stockService, 'searchStocks').mockRejectedValue(
      new Error('Yahoo Finance search returned HTTP 500'),
    );
    const req = makeRequest('/stock/search?q=apple&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(502);
  });
});

// ── fetchStockQuote - source fallback ─────────────────────────────────────────

describe('fetchStockQuote - source fallback', () => {
  it('returns price from chart API on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'AAPL',
                    shortName: 'Apple Inc.',
                    regularMarketPrice: 213.49,
                    currency: 'USD',
                    fullExchangeName: 'NasdaqGS',
                    regularMarketTime: 1710000000,
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const quote = await stockService.fetchStockQuote('AAPL');
    expect(quote.price).toBe(213.49);
    expect(quote.ticker).toBe('AAPL');
    expect(quote.currency).toBe('USD');
  });

  it('falls back to Jina when chart API fails', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('query2.finance.yahoo.com')) {
          return Promise.resolve(new Response('Error', { status: 500 }));
        }
        // Jina response
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { content: '\n**150.25** Change\n', title: 'Apple Inc. (AAPL) Stock Price' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }),
    );
    const quote = await stockService.fetchStockQuote('AAPL');
    expect(quote.price).toBe(150.25);
    expect(quote.name).toBe('Apple Inc.');
    expect(callCount).toBe(2);
  });

  it('throws "not found" when both sources return 404/not-found errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));
    await expect(stockService.fetchStockQuote('FAKE')).rejects.toThrow('not found');
  });

  it('throws aggregated error when sources fail with non-404 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })),
    );
    await expect(stockService.fetchStockQuote('AAPL')).rejects.toThrow('All sources failed');
  });
});

// ── searchStocks ──────────────────────────────────────────────────────────────

describe('searchStocks', () => {
  it('maps Yahoo Finance response to StockSearchResult array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            quotes: [
              { symbol: 'AAPL', shortname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' },
              {
                symbol: 'AAPL.BA',
                shortname: 'Apple Inc.',
                exchDisp: 'Buenos Aires',
                quoteType: 'EQUITY',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const results = await stockService.searchStocks('apple');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      type: 'EQUITY',
    });
  });

  it('filters out results with no symbol or name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            quotes: [
              { symbol: 'AAPL', shortname: 'Apple Inc.' },
              { symbol: 'NONAME' }, // no shortname or longname — filtered out
              { shortname: 'No symbol' }, // no symbol — filtered out
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const results = await stockService.searchStocks('apple');
    expect(results).toHaveLength(1);
    expect(results[0]!.ticker).toBe('AAPL');
  });

  it('returns empty array when quotes is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const results = await stockService.searchStocks('xyz');
    expect(results).toEqual([]);
  });

  it('throws when upstream returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Error', { status: 500 })));
    await expect(stockService.searchStocks('apple')).rejects.toThrow('HTTP 500');
  });
});
