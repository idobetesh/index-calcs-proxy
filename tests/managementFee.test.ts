import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as mgmtService from '../src/services/managementFee.js';
import { fetchManagementFee, fetchTaseManagementFee } from '../src/services/managementFee.js';
import type { ManagementFeeResult } from '../src/types/managementFee.js';

const TASE_FUND_ID = '1234567';
/** Listed on TASE via inday API — not in Maya funds endpoints. */
const TASE_LISTED_FUND_ID = '9876543';

const MOCK_FEE = {
  id: TASE_FUND_ID,
  name: 'Example TASE ETF',
  managementFee: 0.25,
  trusteeFee: 0.03,
  variableFee: 0.3,
  saleLoad: 0,
  managerName: 'מגדל',
  fundType: 'קרן סל',
  source: 'maya-etf',
};

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

/** Jina request URLs embed `finance.yahoo.com/quote/...`; only match our direct HTML fetches. */
function isDirectYahooQuotePage(u: string): boolean {
  return /^https:\/\/finance\.yahoo\.com\/quote\/[^/]+\/?$/.test(u);
}

function isJinaYahooQuote(u: string): boolean {
  return u.includes('r.jina.ai/https://finance.yahoo.com/quote/');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchManagementFee', () => {
  it('loads TASE ETF fees from Maya after mutual 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/funds/mutual/')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      if (u.includes(`/funds/etf/${TASE_FUND_ID}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              name: 'Example TASE ETF',
              managementFee: 0.25,
              trusteeFee: 0.03,
              variableFee: 0.3,
              saleLoad: 0,
              managerName: 'מגדל',
              fundType: 'קרן סל',
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchTaseManagementFee(TASE_FUND_ID);
    expect(fee.source).toBe('maya-etf');
    expect(fee.managementFee).toBe(0.25);
    expect(fee.trusteeFee).toBe(0.03);
  });

  it('reads expense ratio from Yahoo quote HTML for tickers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (isDirectYahooQuotePage(u)) {
        return Promise.resolve(
          new Response(
            '"longName":"SPDR S&P 500 ETF Trust",' +
              '"annualReportExpenseRatio":{"raw":9.0E-4,"fmt":"0.09%"}',
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchManagementFee('SPY');
    expect(fee).toMatchObject({
      id: 'SPY',
      managementFee: 0.09,
      source: 'yahoo-html',
      fundType: 'ETF',
    });
  });

  it('loads fees from TASE major_data when Maya has no fund record', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/funds/mutual/') || u.includes('/funds/etf/')) {
        return Promise.resolve(new Response('{"message":"not found"}', { status: 404 }));
      }
      if (u.includes('r.jina.ai/https://market.tase.co.il/en/market_data/security/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                content: 'Fund full name\nExample Foreign UCITS ETF\nManagement Fee (%)\n\n0.07\n',
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchTaseManagementFee(TASE_LISTED_FUND_ID);
    expect(fee).toMatchObject({
      id: TASE_LISTED_FUND_ID,
      managementFee: 0.07,
      name: 'Example Foreign UCITS ETF',
      source: 'tase-major-jina',
    });
  });

  it('falls back to Jina when Yahoo HTML has no expense ratio', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (isDirectYahooQuotePage(u)) {
        return Promise.resolve(new Response('<html>no fee here</html>', { status: 200 }));
      }
      if (isJinaYahooQuote(u)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                title: 'Vanguard S&P 500 ETF (VOO)',
                content: 'Fund overview\nExpense Ratio (net) 0.03%\n',
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchManagementFee('VOO');
    expect(fee).toMatchObject({
      id: 'VOO',
      managementFee: 0.03,
      source: 'yahoo-jina',
    });
  });

  it('falls back to justETF TER when Yahoo Jina has no expense ratio', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (isDirectYahooQuotePage(u)) {
        return Promise.resolve(new Response('<html>no fee</html>', { status: 200 }));
      }
      if (isJinaYahooQuote(u)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                title: 'SPDR S&P 500 ETF (SPY)',
                content: 'Overview IE00B3YCGJ38 listed on ARCA',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (u.includes('r.jina.ai') && u.includes('justetf.com/en/etf-profile')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                content: 'SPY total expense ratio **0.09 %** ongoing charges',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (u.includes('finance.yahoo.com/quote/') && u.includes('/profile/')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchManagementFee('SPY');
    expect(fee.managementFee).toBe(0.09);
    expect(fee.source).toBe('justetf-jina');
  });
});

describe('GET /mgmt-fee', () => {
  it('returns 401 without secret', async () => {
    const res = await app.fetch(makeRequest(`/mgmt-fee?id=${TASE_FUND_ID}`), env);
    expect(res.status).toBe(401);
  });

  it('returns plain management fee percent for text format', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest(`/mgmt-fee?id=${TASE_FUND_ID}&format=text&secret=test-secret`),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('0.25');
  });

  it('returns trustee fee with part=trustee', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest(`/mgmt-fee?id=${TASE_FUND_ID}&format=text&part=trustee&secret=test-secret`),
      env,
    );
    expect(await res.text()).toBe('0.03');
  });

  it('returns JSON breakdown', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest(`/mgmt-fee?id=${TASE_FUND_ID}&format=json&secret=test-secret`),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ManagementFeeResult;
    expect(body.managementFee).toBe(0.25);
    expect(body.trusteeFee).toBe(0.03);
    expect(body.source).toBe('maya-etf');
  });

  it('returns 404 for part=trustee when trustee fee is null', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue({
      ...MOCK_FEE,
      trusteeFee: null,
    });
    const res = await app.fetch(
      makeRequest('/mgmt-fee?id=SPY&format=text&part=trustee&secret=test-secret'),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when fee unavailable', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockRejectedValue(
      new Error('Management fee not found for "1234567890".'),
    );
    const res = await app.fetch(makeRequest('/mgmt-fee?id=1234567890&secret=test-secret'), env);
    expect(res.status).toBe(404);
  });
});
