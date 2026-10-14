import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as mgmtService from '../src/services/managementFee.js';
import { fetchManagementFee, fetchTaseManagementFee } from '../src/services/managementFee.js';
import type { ManagementFeeResult } from '../src/types/managementFee.js';

const MOCK_FEE = {
  id: '1150572',
  name: 'MTF סל SP500',
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
      if (u.includes('/funds/etf/1150572')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              name: 'MTF סל SP500',
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

    const fee = await fetchTaseManagementFee('1150572');
    expect(fee.source).toBe('maya-etf');
    expect(fee.managementFee).toBe(0.25);
    expect(fee.trusteeFee).toBe(0.03);
  });

  it('reads expense ratio from Yahoo via Jina for tickers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('r.jina.ai') && u.includes('yahoo.com/quote/VUAA.L')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                title: 'Vanguard S&P 500 UCITS ETF (VUAA.L)',
                content: 'Fund overview\nExpense Ratio (net) 0.07%\n',
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchManagementFee('VUAA.L');
    expect(fee).toMatchObject({
      id: 'VUAA.L',
      managementFee: 0.07,
      source: 'yahoo-jina',
      fundType: 'ETF',
    });
  });

  it('falls back to justETF TER when Yahoo Jina has no expense ratio', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('r.jina.ai') && u.includes('yahoo.com/quote/FWRA.L')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                title: 'iShares FTSE All-World (FWRA.L)',
                content: 'Overview IE00BK5BQT80 listed on LSE',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (u.includes('r.jina.ai') && u.includes('justetf.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                content: 'FWRA total expense ratio **0.22 %** ongoing charges',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (u.includes('finance.yahoo.com') && u.includes('/profile/')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });

    const fee = await fetchManagementFee('FWRA.L');
    expect(fee.managementFee).toBe(0.22);
    expect(fee.source).toBe('justetf-jina');
  });
});

describe('GET /mgmt-fee', () => {
  it('returns 401 without secret', async () => {
    const res = await app.fetch(makeRequest('/mgmt-fee?id=1150572'), env);
    expect(res.status).toBe(401);
  });

  it('returns plain management fee percent for text format', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest('/mgmt-fee?id=1150572&format=text&secret=test-secret'),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('0.25');
  });

  it('returns trustee fee with part=trustee', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest('/mgmt-fee?id=1150572&format=text&part=trustee&secret=test-secret'),
      env,
    );
    expect(await res.text()).toBe('0.03');
  });

  it('returns JSON breakdown', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockResolvedValue(MOCK_FEE);
    const res = await app.fetch(
      makeRequest('/mgmt-fee?id=1150572&format=json&secret=test-secret'),
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
      makeRequest('/mgmt-fee?id=VUAA.L&format=text&part=trustee&secret=test-secret'),
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
