import { TaseQuote, MayaFundResponse, TaseInDayResponse } from '../types/tase.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { fetchJinaReaderPage, jinaReaderFetchOptions } from '../utils/jina.js';

export type { TaseQuote };

const TIMEOUT_MS = 8_000;

const DIRECT_API_SOURCES = new Set(['maya-mutual', 'maya-etf', 'tase-inday']);

/**
 * All TASE quotes use price in ILA (agorot, 1/100 ILS).
 * Maya/TASE JSON APIs already return agorot. Scraped (Jina) pages may show NIS decimals.
 */
export function normalizeTasePriceAgurot(raw: number, source: string): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`Invalid TASE price: ${raw}`);
  }

  let agorot = raw;
  if (!DIRECT_API_SOURCES.has(source)) {
    const hasFraction = Math.abs(raw - Math.round(raw)) > 1e-9;
    if (hasFraction) {
      agorot = raw * 100;
    }
  }

  return Math.round(agorot);
}

function toTaseQuote(
  id: string,
  name: string,
  rawPrice: number,
  date: string,
  source: string,
): TaseQuote {
  return {
    id,
    name,
    price: normalizeTasePriceAgurot(rawPrice, source),
    currency: 'ILA',
    date,
    source,
  };
}

/**
 * Source 1: Maya TASE mutual funds API.
 * Covers open-ended funds — security IDs typically starting with 5.
 */
async function fetchMayaMutual(id: string): Promise<TaseQuote> {
  const res = await fetchWithTimeout(
    `https://maya.tase.co.il/api/v1/funds/mutual/${id}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[maya-mutual] HTTP ${res.status}`);
  const json: unknown = await res.json();
  const data = json as MayaFundResponse;
  const raw = data.purchasePrice ?? data.redemptionPrice;
  if (!raw) throw new Error('[maya-mutual] No price in response');
  return toTaseQuote(id, data.name ?? '', raw, data.ratesAsOf ?? '', 'maya-mutual');
}

/**
 * Source 2: Maya TASE ETF API.
 * Covers Israeli basket ETFs (קרנות סל) — security IDs typically starting with 1.
 */
async function fetchMayaEtf(id: string): Promise<TaseQuote> {
  const res = await fetchWithTimeout(
    `https://maya.tase.co.il/api/v1/funds/etf/${id}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[maya-etf] HTTP ${res.status}`);
  const json: unknown = await res.json();
  const data = json as MayaFundResponse;
  const raw = data.purchasePrice ?? data.redemptionPrice;
  if (!raw) throw new Error('[maya-etf] No price in response');
  return toTaseQuote(id, data.name ?? '', raw, data.ratesAsOf ?? '', 'maya-etf');
}

/**
 * Source 3: TASE intraday API.
 * Covers foreign ETFs and other securities not available via the Maya funds API.
 */
async function fetchTaseInDay(id: string): Promise<TaseQuote> {
  const oid = id.padStart(8, '0');
  const url = `https://api.tase.co.il/api/charts/getindaydata?ct=0&ot=1&lang=1&cf=0&cp=0&cv=0&cl=0&cgt=1&dFrom=&dTo=&oid=${oid}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://market.tase.co.il/',
        Origin: 'https://market.tase.co.il',
      },
    },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[tase-inday] HTTP ${res.status}`);

  const json: unknown = await res.json();
  const data = json as TaseInDayResponse;

  // Prefer latest intraday price, fall back to base rate
  const inDay = data.inDay ?? [];
  const raw = inDay.length > 0 ? inDay[inDay.length - 1]?.pval : data.baseInfo?.brte;
  if (!raw) throw new Error('[tase-inday] No price in response');

  return toTaseQuote(id, '', raw, data.baseInfo?.dte ?? '', 'tase-inday');
}

interface JinaSource {
  name: string;
  url: (id: string) => string;
  /** Extract price from Jina-rendered markdown. Return null if not found. */
  parse: (content: string) => number | null;
}

/**
 * Jina-renderable sources. Each entry is tried in order when all direct API
 * sources fail. Jina (r.jina.ai) runs a headless browser server-side, making
 * it possible to scrape JS-heavy pages that return no useful static HTML.
 *
 * To add a new source: add an entry with the page URL and a price parser.
 * Funder.co.il was evaluated but blocks all requests (HTTP 403) — excluded.
 */
const JINA_SOURCES: JinaSource[] = [
  {
    name: 'jina-tase',
    url: (id) => `https://market.tase.co.il/en/market_data/security/${id}/major_data`,
    // Last rate appears as "**33,750** Change" near the top of the rendered page
    parse: (content): number | null => {
      const m = content.match(/\*\*([\d,]+)\*\*\s*Change/);
      return m?.[1] ? parseFloat(m[1].replace(/,/g, '')) : null;
    },
  },
  {
    name: 'jina-themarker',
    url: (id) => `http://finance.themarker.com/etf/${id}`,
    // Price appears as "שער 33,750.00" followed by change data
    parse: (content): number | null => {
      const m = content.match(/שער\s+([\d,]+\.?\d*)/);
      return m?.[1] ? parseFloat(m[1].replace(/,/g, '')) : null;
    },
  },
  {
    name: 'jina-bizportal',
    url: (id) => `https://www.bizportal.co.il/tradedfund/quote/generalview/${id}`,
    // Last traded price appears as a standalone number on its own line (e.g. "33,820")
    // Fallback: שער בסיס (base rate) label
    parse: (content): number | null => {
      const standalone = content.match(/\n([\d,]{4,8})\n/);
      if (standalone?.[1]) return parseFloat(standalone[1].replace(/,/g, ''));
      const base = content.match(/שער בסיס\s*([\d,]+)/);
      return base?.[1] ? parseFloat(base[1].replace(/,/g, '')) : null;
    },
  },
];

/**
 * Fetches a page via Jina Reader and extracts the price using the source's parser.
 */
async function fetchViaJina(
  id: string,
  source: JinaSource,
  jinaApiKey?: string,
): Promise<TaseQuote> {
  const { content } = await fetchJinaReaderPage(
    source.url(id),
    jinaReaderFetchOptions(jinaApiKey, TIMEOUT_MS),
  ).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg.replace('[jina]', `[${source.name}]`));
  });
  const price = source.parse(content);
  if (price == null || isNaN(price) || price <= 0) {
    throw new Error(`[${source.name}] Could not parse price from rendered content`);
  }
  return toTaseQuote(id, '', price, '', source.name);
}

/**
 * Fetches the current price for an Israeli ETF/fund by its TASE security number.
 * Direct sources (fast JSON APIs) are tried first in sequence.
 * If all direct sources fail, all Jina-rendered sources are raced in parallel
 * via Promise.any() — the first to succeed wins.
 * Throws only if everything fails.
 */
export async function fetchTaseQuote(id: string, jinaApiKey?: string): Promise<TaseQuote> {
  const directSources: Array<() => Promise<TaseQuote>> = [
    (): Promise<TaseQuote> => fetchMayaMutual(id),
    (): Promise<TaseQuote> => fetchMayaEtf(id),
    (): Promise<TaseQuote> => fetchTaseInDay(id),
  ];

  const directErrors: string[] = [];
  for (const source of directSources) {
    try {
      return await source();
    } catch (err) {
      directErrors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // All direct sources failed — race Jina sources in parallel
  try {
    return await Promise.any(JINA_SOURCES.map((s) => fetchViaJina(id, s, jinaApiKey)));
  } catch (err) {
    const jinaErrors =
      err instanceof AggregateError
        ? err.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e)))
        : [err instanceof Error ? err.message : String(err)];

    const allErrors = [...directErrors, ...jinaErrors];
    const allNotFound = allErrors.every(
      (e) => e.includes('404') || e.includes('not found') || e.includes('parse price'),
    );
    if (allNotFound) {
      throw new Error(`Security "${id}" not found. Please check the TASE security number.`);
    }
    throw new Error(`All sources failed for ETF "${id}":\n${allErrors.join('\n')}`);
  }
}
