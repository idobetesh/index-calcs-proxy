import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as divService from '../src/services/dividend.js';

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
    const body = await res.json();
    expect(body.nextDate).toBe('2026-11-10');
    expect(body.amount).toBe(0.27);
  });
});
