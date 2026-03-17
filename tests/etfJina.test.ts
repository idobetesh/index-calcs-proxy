import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEtfQuote, JINA_SOURCES } from '../src/services/etf.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── JINA_SOURCES parser unit tests ────────────────────────────────────────────

describe('JINA_SOURCES parsers', () => {
  const tase = JINA_SOURCES.find((s) => s.name === 'jina-tase')!;
  const themarker = JINA_SOURCES.find((s) => s.name === 'jina-themarker')!;
  const bizportal = JINA_SOURCES.find((s) => s.name === 'jina-bizportal')!;

  describe('jina-tase', () => {
    it('extracts price from "**33,750** Change" pattern', () => {
      expect(tase.parse('*   1159235\n**33,750** Change\n**0.35%**\n')).toBe(33750);
    });

    it('handles price without comma separator', () => {
      expect(tase.parse('**8500** Change\n')).toBe(8500);
    });

    it('returns null when pattern is absent', () => {
      expect(tase.parse('some unrelated content')).toBeNull();
    });

    it('builds correct URL', () => {
      expect(tase.url('1159235')).toBe(
        'https://market.tase.co.il/en/market_data/security/1159235/major_data',
      );
    });
  });

  describe('jina-themarker', () => {
    it('extracts price from "שער 33,750.00" pattern', () => {
      expect(themarker.parse('שער 33,750.00\n% שינוי -0.35\n')).toBe(33750);
    });

    it('extracts integer price without decimals', () => {
      expect(themarker.parse('שער 8,423\n')).toBe(8423);
    });

    it('returns null when pattern is absent', () => {
      expect(themarker.parse('some unrelated content')).toBeNull();
    });

    it('builds correct URL', () => {
      expect(themarker.url('1150572')).toBe('http://finance.themarker.com/etf/1150572');
    });
  });

  describe('jina-bizportal', () => {
    it('extracts standalone price on its own line', () => {
      expect(bizportal.parse('some text\n33,820\nmore text\n')).toBe(33820);
    });

    it('falls back to שער בסיס when no standalone price', () => {
      expect(bizportal.parse('שער בסיס 33,870\nשער פתיחה 0%33,870\n')).toBe(33870);
    });

    it('prefers standalone price over שער בסיס', () => {
      expect(bizportal.parse('some text\n33,820\nשער בסיס 33,870\n')).toBe(33820);
    });

    it('returns null when neither pattern found', () => {
      expect(bizportal.parse('no price here at all')).toBeNull();
    });

    it('builds correct URL', () => {
      expect(bizportal.url('1159235')).toBe(
        'https://www.bizportal.co.il/tradedfund/quote/generalview/1159235',
      );
    });
  });
});

// ── fetchEtfQuote — TASE intraday fallback ────────────────────────────────────

describe('fetchEtfQuote - tase-inday fallback', () => {
  it('falls back to tase-inday when both Maya APIs return 404', async () => {
    const taseResponse = { baseInfo: { brte: 33870, dte: '17/03/2026' }, inDay: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('maya.tase.co.il')) {
          return Promise.resolve(new Response('Not Found', { status: 404 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(taseResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    const quote = await fetchEtfQuote('1159235');
    expect(quote.price).toBe(33870);
    expect(quote.source).toBe('tase-inday');
  });

  it('prefers latest inDay price over baseInfo.brte', async () => {
    const taseResponse = {
      baseInfo: { brte: 33870, dte: '17/03/2026' },
      inDay: [{ pval: 33500 }, { pval: 33750 }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('maya.tase.co.il')) {
          return Promise.resolve(new Response('Not Found', { status: 404 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(taseResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    const quote = await fetchEtfQuote('1159235');
    expect(quote.price).toBe(33750); // last inDay entry
  });

  it('sends Chrome User-Agent to TASE intraday API', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('maya.tase.co.il')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ baseInfo: { brte: 100 }, inDay: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchEtfQuote('1159235');

    const taseCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('api.tase.co.il'));
    expect(taseCall).toBeDefined();
    const ua = (taseCall?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(ua?.['User-Agent']).toMatch(/Chrome/);
  });
});

// ── fetchEtfQuote — Jina fallback ─────────────────────────────────────────────

function jinaResponse(content: string): Response {
  return new Response(JSON.stringify({ data: { content, title: 'Test Fund | Site' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchEtfQuote - Jina fallback', () => {
  it('tries Jina sources when all direct sources fail', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('r.jina.ai')) {
        return Promise.resolve(jinaResponse('**33,750** Change\n'));
      }
      return Promise.resolve(new Response('Server Error', { status: 500 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const quote = await fetchEtfQuote('1159235');
    expect(quote.price).toBe(33750);
    expect(quote.source).toBe('jina-tase');
  });

  it('fires all Jina sources in parallel', async () => {
    const calledUrls: string[] = [];
    // Delay each Jina response slightly so they clearly overlap
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('r.jina.ai')) {
          calledUrls.push(url as string);
          return new Promise((resolve) =>
            setTimeout(() => resolve(jinaResponse('**33,750** Change\n')), 10),
          );
        }
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      }),
    );

    await fetchEtfQuote('1159235');

    const jinaCalls = calledUrls.filter((u) => u.includes('r.jina.ai'));
    expect(jinaCalls.length).toBe(JINA_SOURCES.length);
    // All Jina URLs should include the security ID
    jinaCalls.forEach((u) => expect(u).toContain('1159235'));
  });

  it('falls back to next Jina source when first parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('r.jina.ai') && url.includes('tase.co.il')) {
          // TASE Jina returns unparseable content
          return Promise.resolve(jinaResponse('no price here'));
        }
        if (url.includes('r.jina.ai') && url.includes('themarker')) {
          return Promise.resolve(jinaResponse('שער 8,423.00\n'));
        }
        if (url.includes('r.jina.ai')) {
          return Promise.resolve(jinaResponse('no price here'));
        }
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      }),
    );

    const quote = await fetchEtfQuote('1150572');
    expect(quote.price).toBe(8423);
    expect(quote.source).toBe('jina-themarker');
  });

  it('throws "not found" when all sources return 404 including Jina', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    await expect(fetchEtfQuote('0000001')).rejects.toThrow('Security "0000001" not found');
  });

  it('throws aggregated error when direct sources fail non-404 and all Jina parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('r.jina.ai')) {
          return Promise.resolve(jinaResponse('no price data here at all'));
        }
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      }),
    );

    await expect(fetchEtfQuote('1159235')).rejects.toThrow('All sources failed');
  });
});
