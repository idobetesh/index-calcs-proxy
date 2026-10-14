import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as mgmtService from '../src/services/managementFee.js';
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

  it('returns 404 when fee unavailable', async () => {
    vi.spyOn(mgmtService, 'fetchManagementFee').mockRejectedValue(
      new Error('Management fee not found for "1234567890".'),
    );
    const res = await app.fetch(makeRequest('/mgmt-fee?id=1234567890&secret=test-secret'), env);
    expect(res.status).toBe(404);
  });
});
