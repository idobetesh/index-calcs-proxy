import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

function makeRequest(path: string): Request {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}secret=test-secret`);
}

const MOCK_SDMX = {
  data: {
    dataSets: [
      {
        series: {
          '0:0:0': {
            observations: {
              '0': ['4', 0],
            },
          },
        },
      },
    ],
    structure: {
      dimensions: {
        observation: [
          {
            id: 'TIME_PERIOD',
            values: [{ id: '2026-03-12', name: '2026-03-12' }],
          },
        ],
      },
    },
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /rate', () => {
  it('returns 200 JSON with rate, effectiveDate, asOf', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_SDMX), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/rate'), env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('rate', 4);
    expect(data).toHaveProperty('effectiveDate', '2026-03-12');
    expect(data).toHaveProperty('asOf', expect.any(String));
  });

  it('returns text/plain with format=text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_SDMX), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/rate?format=text'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('4.00');
  });

  it('returns 502 when BOI API is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));
    const res = await app.fetch(makeRequest('/rate'), env);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 502 on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const res = await app.fetch(makeRequest('/rate'), env);
    expect(res.status).toBe(502);
  });

  it('sets Cache-Control: public, max-age=3600', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_SDMX), { status: 200 }),
    );
    const res = await app.fetch(makeRequest('/rate'), env);
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });
});
