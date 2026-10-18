import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import {
  fetchAaiiSentiment,
  parseAaiiSentimentFromContent,
  parseAaiiSentimentFromXlsContent,
  monthDayToWeekEndingIso,
} from '../src/services/aaiiSentiment.js';
import type { AaiiSentimentResult } from '../src/types/aaiiSentiment.js';

const SAMPLE = `Bullish Neutral Bearish
Oct 14 38.7%19.7%41.6%
Oct 7 40.3%20.8%39.0%
Sep 30 34.6%18.9%46.5%
Sep 23 32.7%19.2%48.1%
Sep 16 28.8%17.9%53.3%
`;

const env = { SECRET_KEY: 'test-secret', ENVIRONMENT: 'test' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('parseAaiiSentimentFromContent', () => {
  it('parses weekly rows newest first', () => {
    const ref = new Date('2026-10-18T12:00:00.000Z');
    const weeks = parseAaiiSentimentFromContent(SAMPLE, 5, ref);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual({
      weekEnding: '2026-10-14',
      bullish: 38.7,
      neutral: 19.7,
      bearish: 41.6,
    });
  });

  it('assigns prior year when row date is ahead of reference', () => {
    expect(monthDayToWeekEndingIso('Dec', 30, new Date('2026-01-05T12:00:00.000Z'))).toBe(
      '2025-12-30',
    );
  });
});

const XLS_SNIPPET =
  '**10-8-26****40.25%****20.76%****38.98%**' + '**10-15-26****38.73%****19.65%****41.62%**';

describe('parseAaiiSentimentFromXlsContent', () => {
  it('returns newest weeks first from XLS markdown', () => {
    const weeks = parseAaiiSentimentFromXlsContent(XLS_SNIPPET, 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.weekEnding).toBe('2026-10-15');
    expect(weeks[0]?.bullish).toBe(38.73);
    expect(weeks[1]?.weekEnding).toBe('2026-10-08');
  });
});

describe('GET /aaii-sentiment', () => {
  it('returns JSON weeks payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('r.jina.ai') && String(input).includes('sent_results')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: SAMPLE } }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });

    const res = await app.fetch(
      new Request('http://localhost/aaii-sentiment?weeks=3&format=json&secret=test-secret'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AaiiSentimentResult;
    expect(body.weeks).toHaveLength(3);
    expect(body.source).toBe('aaii.com');
    expect(body.weeks[0]?.bullish).toBe(38.7);
  });

  it('returns latest bullish as text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { content: SAMPLE } }), { status: 200 }),
    );
    const res = await app.fetch(
      new Request('http://localhost/aaii-sentiment?format=text&secret=test-secret'),
      env,
    );
    expect(await res.text()).toBe('38.7');
  });
});

describe('fetchAaiiSentiment', () => {
  it('loads from Jina-rendered AAII page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('r.jina.ai')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: SAMPLE } }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });
    const result = await fetchAaiiSentiment(2);
    expect(result.weeks).toHaveLength(2);
  });

  it('falls back to sentiment.xls when sent_results returns 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('sent_results')) {
        return Promise.resolve(new Response('rate limited', { status: 429 }));
      }
      if (u.includes('sentiment.xls')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { content: XLS_SNIPPET } }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });
    const result = await fetchAaiiSentiment(1);
    expect(result.source).toBe('aaii.com-sentiment.xls');
    expect(result.weeks[0]?.bullish).toBe(38.73);
  });
});
