import { ManagementFeeResult } from '../types/managementFee.js';
import { MayaFundResponse } from '../types/tase.js';
import { fetchWithTimeout } from '../utils/fetch.js';

const MAYA_TIMEOUT_MS = 8_000;
/** Jina-rendered Yahoo pages are slow; expense ratio only available via this path for tickers. */
const JINA_TIMEOUT_MS = 20_000;

const MAYA_HEADERS = { Accept: 'application/json', 'User-Agent': 'curl/8.0' };
const YF_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EXPENSE_RATIO_MARKER = /Expense Ratio[^0-9]*([\d.]+)\s*%/i;
const UCITS_ISIN_MARKER = /\b(IE|LU|DE|FR|NL)[A-Z0-9]{10}\b/g;
const JUSTETF_TER_MARKER = /total expense ratio[^*]*\*\*([\d.]+)\s*%/i;

async function fetchMayaFund(path: 'etf' | 'mutual', id: string): Promise<MayaFundResponse> {
  const res = await fetchWithTimeout(
    `https://maya.tase.co.il/api/v1/funds/${path}/${id}`,
    { headers: MAYA_HEADERS },
    MAYA_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[maya-${path}] HTTP ${res.status}`);
  return (await res.json()) as MayaFundResponse;
}

function fromMaya(id: string, data: MayaFundResponse, source: string): ManagementFeeResult {
  const managementFee = data.managementFee;
  if (managementFee == null || !Number.isFinite(managementFee)) {
    throw new Error(`[${source}] No management fee in response`);
  }

  return {
    id,
    name: data.name ?? '',
    managementFee,
    trusteeFee: data.trusteeFee ?? null,
    variableFee: data.variableFee ?? null,
    saleLoad: data.saleLoad ?? null,
    managerName: data.managerName ?? '',
    fundType: data.fundType ?? '',
    source,
  };
}

/**
 * TASE fund / ETF by security number — Maya mutual + ETF APIs.
 */
export async function fetchTaseManagementFee(id: string): Promise<ManagementFeeResult> {
  const sources: Array<{ path: 'mutual' | 'etf'; label: string }> = [
    { path: 'mutual', label: 'maya-mutual' },
    { path: 'etf', label: 'maya-etf' },
  ];

  const errors: string[] = [];
  for (const { path, label } of sources) {
    try {
      const data = await fetchMayaFund(path, id);
      return fromMaya(id, data, label);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const allNotFound = errors.every((e) => e.includes('404') || e.includes('HTTP 404'));
  if (allNotFound) {
    throw new Error(
      `Management fee not found for "${id}". Use a TASE mutual fund or ETF security number.`,
    );
  }
  throw new Error(`All sources failed for "${id}":\n${errors.join('\n')}`);
}

async function fetchJinaPage(url: string): Promise<string> {
  const res = await fetchWithTimeout(
    `https://r.jina.ai/${url}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    JINA_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[jina] HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { content?: string } };
  return json?.data?.content ?? '';
}

function extractUcitsIsins(text: string): string[] {
  const found = text.match(UCITS_ISIN_MARKER) ?? [];
  return [...new Set(found)];
}

/** Yahoo profile HTML often embeds fund ISIN even when Jina quote text does not. */
async function fetchIsinsFromYahooProfile(ticker: string): Promise<string[]> {
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/profile/`;
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': YF_UA, Accept: 'text/html' } },
    MAYA_TIMEOUT_MS,
  );
  if (!res.ok) return [];
  const html = await res.text();
  const isins = extractUcitsIsins(html);
  isins.sort((a, b) => {
    const score = (s: string): number => (s.startsWith('IE00') ? 0 : s.startsWith('IE') ? 1 : 2);
    return score(a) - score(b);
  });
  return isins;
}

async function fetchTerFromJustEtf(isin: string, tickerHint?: string): Promise<number> {
  const content = await fetchJinaPage(
    `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`,
  );
  if (tickerHint) {
    const base = tickerHint.replace(/\.[A-Z]{1,4}$/i, '');
    const tickerOk = new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
      content,
    );
    if (!tickerOk) {
      throw new Error(`[justetf-jina] ISIN ${isin} does not match ticker ${tickerHint}`);
    }
  }
  const match = JUSTETF_TER_MARKER.exec(content);
  const pct = match?.[1] ? parseFloat(match[1]) : NaN;
  if (!Number.isFinite(pct)) {
    throw new Error(`[justetf-jina] No TER for ISIN ${isin}`);
  }
  return pct;
}

async function resolveTerViaJustEtf(ticker: string, jinaContent: string): Promise<number> {
  const candidates = [
    ...extractUcitsIsins(jinaContent),
    ...(await fetchIsinsFromYahooProfile(ticker)),
  ];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const isin of candidates) {
    if (seen.has(isin)) continue;
    seen.add(isin);
    try {
      return await fetchTerFromJustEtf(isin, ticker);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(
    errors.length > 0
      ? errors.join('\n')
      : `No UCITS ISIN found to resolve expense ratio for "${ticker}".`,
  );
}

async function fetchTickerExpenseViaJina(ticker: string): Promise<ManagementFeeResult> {
  const upper = ticker.toUpperCase();
  const pageUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(upper)}/`;
  const res = await fetchWithTimeout(
    `https://r.jina.ai/${pageUrl}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    JINA_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[jina-yf-fee] HTTP ${res.status}`);

  const json = (await res.json()) as { data?: { content?: string; title?: string } };
  const content = json?.data?.content ?? '';
  const title = json?.data?.title ?? '';
  const nameMatch = title.match(/^(.+?)\s*\(/);
  const name = nameMatch?.[1]?.trim() ?? upper;

  const yahooMatch = EXPENSE_RATIO_MARKER.exec(content);
  let pct = yahooMatch?.[1] ? parseFloat(yahooMatch[1]) : NaN;
  let source = 'yahoo-jina';

  if (!Number.isFinite(pct)) {
    pct = await resolveTerViaJustEtf(upper, content);
    source = 'justetf-jina';
  }

  return {
    id: upper,
    name,
    managementFee: pct,
    trusteeFee: null,
    variableFee: null,
    saleLoad: null,
    managerName: '',
    fundType: 'ETF',
    source,
  };
}

/**
 * TASE numeric id → Maya; ticker → Yahoo expense ratio (Jina fallback).
 */
export async function fetchManagementFee(id: string): Promise<ManagementFeeResult> {
  if (/^\d+$/.test(id)) {
    return fetchTaseManagementFee(id);
  }
  return fetchTickerExpenseViaJina(id);
}
