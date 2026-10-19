import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as cbs from '../src/services/cbs.js';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
} from '../src/utils/session.js';

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('session tokens', () => {
  it('creates and verifies a valid token', async () => {
    const token = await createSessionToken('test-secret');
    expect(await verifySessionToken('test-secret', token)).toBe(true);
    expect(await verifySessionToken('wrong-secret', token)).toBe(false);
  });
});

describe('UI session auth', () => {
  it('sets session cookie after ?key= and allows API without query secret', async () => {
    const uiRes = await app.fetch(new Request('http://localhost/?key=test-secret'), env);
    expect(uiRes.status).toBe(200);
    const setCookie = uiRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);

    const cookiePair = setCookie.split(';')[0] ?? '';
    vi.spyOn(cbs, 'fetchIndexData').mockImplementation(async (indexType) => {
      const periods: Record<string, string> = {
        cpi: '2025-01',
        construction: '2025-01',
        housing: '2025-01',
      };
      return [{ period: periods[indexType] ?? '2025-01', value: 100, monthlyPercent: 0 }];
    });

    const apiRes = await app.fetch(
      new Request('http://localhost/latest', { headers: { Cookie: cookiePair } }),
      env,
    );
    expect(apiRes.status).toBe(200);
  });

  it('returns 403 for / without key or session', async () => {
    const res = await app.fetch(new Request('http://localhost/'), env);
    expect(res.status).toBe(403);
  });
});
