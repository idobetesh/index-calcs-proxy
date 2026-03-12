import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import * as cbs from '../src/services/cbs.js';

const MOCK_ENTRIES = [
  { period: '2024-01', value: 100.0, monthlyPercent: 0.0 },
  { period: '2024-02', value: 101.5, monthlyPercent: 1.5 },
  { period: '2024-03', value: 103.0, monthlyPercent: 1.5 },
];

// Mock environment for Hono bindings
function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

// Create a fake environment with the secret
const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const req = makeRequest('/health');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('ok');
  });
});

describe('GET /calc - auth middleware misconfiguration', () => {
  it('returns 500 when SECRET_KEY is not configured', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01&secret=anything');
    const res = await app.fetch(req, { ENVIRONMENT: 'test' }); // no SECRET_KEY
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringContaining('SECRET_KEY'));
  });
});

describe('GET /calc - auth', () => {
  it('returns 401 without secret', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-01&secret=wrong');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('accepts secret via Authorization header', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03', {
      Authorization: 'Bearer test-secret',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
  });
});

describe('GET /calc - validation', () => {
  it('returns 400 for missing amount', async () => {
    const req = makeRequest('/calc?from=2024-01&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/amount/i));
  });

  it('returns 400 for invalid from date', async () => {
    const req = makeRequest('/calc?amount=100000&from=2024-13&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/from/i));
  });

  it('returns 400 when from >= to', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-03&to=2024-01&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', expect.stringMatching(/from.*to/i));
  });
});

describe('GET /calc - text response', () => {
  it('returns plain text result for valid request', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    // Two lines: indexed amount (integer) then percentage as decimal fraction (4dp, e.g. 0.0302)
    expect(text).toMatch(/^\d+\n0\.\d{4}$/);
  });

  it('sets Cache-Control: no-store', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest('/calc?amount=100000&from=2024-01&to=2024-03&secret=test-secret');
    const res = await app.fetch(req, env);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /calc - JSON response', () => {
  it('returns full CalcResult object when format=json', async () => {
    vi.spyOn(cbs, 'fetchIndexData').mockResolvedValue(MOCK_ENTRIES);
    const req = makeRequest(
      '/calc?amount=100000&from=2024-01&to=2024-03&format=json&secret=test-secret',
    );
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    // multiplier = 1.015 * 1.015 = 1.030225 → 103022, 3.02%
    expect(body).toHaveProperty('indexedAmount', 103022);
    expect(body).toHaveProperty('percentage', 3.02);
    expect(body).toHaveProperty('formatted', '₪103,022 / 3.02%');
    expect(body).toHaveProperty('fromPeriod', '2024-01');
    expect(body).toHaveProperty('toPeriod', '2024-03');
  });
});

describe('GET /', () => {
  it('returns HTML calculator UI', async () => {
    const req = makeRequest('/?key=test-secret');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Index Calculator');
  });
});
