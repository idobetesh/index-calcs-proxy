import { ManagementFeeResult } from '../types/managementFee.js';
import { MayaFundResponse } from '../types/tase.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { fetchJinaReaderPage, jinaReaderFetchOptions } from '../utils/jina.js';

const MAYA_TIMEOUT_MS = 8_000;
/** Jina-rendered Yahoo pages are slow; expense ratio only available via this path for tickers. */
const JINA_TIMEOUT_MS = 20_000;

const MAYA_HEADERS = { Accept: 'application/json', 'User-Agent': 'curl/8.0' };
const YF_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EXPENSE_RATIO_MARKER = /Expense Ratio[^0-9]*([\d.]+)\s*%/i;
const YAHOO_EXPENSE_RAW = /"annualReportExpenseRatio"\s*:\s*\{\s*"raw"\s*:\s*([\d.E+-]+)/i;
const YAHOO_EXPENSE_FMT = /"annualReportExpenseRatio"\s*:\s*\{[^}]*"fmt"\s*:\s*"([\d.]+)%"/i;
const YAHOO_LONG_NAME = /"longName"\s*:\s*"([^"\\]+)"/;
const UCITS_ISIN_MARKER = /\b(IE|LU|DE|FR|NL)[A-Z0-9]{10}\b/g;
const JUSTETF_TER_MARKER = /total expense ratio[^*]*\*\*([\d.]+)\s*%/i;
/** TASE major_data (Jina) — foreign / inday-listed funds not in Maya funds API. */
const TASE_MAJOR_MGMT_FEE = /Management Fee \(%\)\s*\n+\s*([\d.]+)/i;
const TASE_MAJOR_FUND_NAME = /Fund full name\s*\n+([^\n#]+)/i;
const THEMARKER_MGMT_FEE = /דמי ניהול\s+([\d.]+)/;
const THEMARKER_TRUSTEE_FEE = /דמי נאמן\s+([\d.]+)/;

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

async function fetchJinaPage(url: string, jinaApiKey?: string): Promise<string> {
  const { content } = await fetchJinaReaderPage(
    url,
    jinaReaderFetchOptions(jinaApiKey, JINA_TIMEOUT_MS),
  );
  return content;
}

function parseFeePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchTaseFeeViaMajorData(
  id: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  const pageUrl = `https://market.tase.co.il/en/market_data/security/${id}/major_data`;
  const content = await fetchJinaPage(pageUrl, jinaApiKey);
  const managementFee = parseFeePercent(TASE_MAJOR_MGMT_FEE.exec(content)?.[1]);
  if (managementFee == null) {
    throw new Error('[tase-major-jina] No management fee in page');
  }
  const name = TASE_MAJOR_FUND_NAME.exec(content)?.[1]?.trim() ?? '';
  return {
    id,
    name,
    managementFee,
    trusteeFee: null,
    variableFee: null,
    saleLoad: null,
    managerName: '',
    fundType: 'ETF',
    source: 'tase-major-jina',
  };
}

async function fetchTaseFeeViaTheMarker(
  id: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  const pageUrl = `http://finance.themarker.com/etf/${id}`;
  const content = await fetchJinaPage(pageUrl, jinaApiKey);
  const managementFee = parseFeePercent(THEMARKER_MGMT_FEE.exec(content)?.[1]);
  if (managementFee == null) {
    throw new Error('[themarker-jina] No management fee in page');
  }
  const trusteeFee = parseFeePercent(THEMARKER_TRUSTEE_FEE.exec(content)?.[1]);
  return {
    id,
    name: '',
    managementFee,
    trusteeFee,
    variableFee: null,
    saleLoad: null,
    managerName: '',
    fundType: '',
    source: 'themarker-jina',
  };
}

async function fetchTaseManagementFeeFromScrape(
  id: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  const errors: string[] = [];
  for (const sourceFn of [fetchTaseFeeViaMajorData, fetchTaseFeeViaTheMarker]) {
    try {
      return await sourceFn(id, jinaApiKey);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(errors.join('\n'));
}

/**
 * TASE fund / ETF by security number — Maya APIs, then TASE / TheMarker pages (Jina).
 */
export async function fetchTaseManagementFee(
  id: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
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

  try {
    return await fetchTaseManagementFeeFromScrape(id, jinaApiKey);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const allNotFound = errors.every(
    (e) =>
      e.includes('404') ||
      e.includes('HTTP 404') ||
      e.includes('not found') ||
      e.includes('No management fee'),
  );
  if (allNotFound) {
    throw new Error(`Management fee not found for TASE security "${id}".`);
  }
  throw new Error(`All sources failed for "${id}":\n${errors.join('\n')}`);
}

function extractUcitsIsins(text: string): string[] {
  const found = text.match(UCITS_ISIN_MARKER) ?? [];
  return [...new Set(found)];
}

function parseExpensePercentFromYahooHtml(html: string): number {
  const fmtMatch = YAHOO_EXPENSE_FMT.exec(html);
  if (fmtMatch?.[1]) {
    const pct = parseFloat(fmtMatch[1]);
    if (Number.isFinite(pct)) return pct;
  }
  const rawMatch = YAHOO_EXPENSE_RAW.exec(html);
  if (rawMatch?.[1]) {
    const raw = parseFloat(rawMatch[1]);
    if (Number.isFinite(raw) && raw > 0) {
      return raw * 100;
    }
  }
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const textMatch = EXPENSE_RATIO_MARKER.exec(stripped);
  const pct = textMatch?.[1] ? parseFloat(textMatch[1]) : NaN;
  return Number.isFinite(pct) ? pct : NaN;
}

function parseFundNameFromYahooHtml(html: string, fallback: string): string {
  return YAHOO_LONG_NAME.exec(html)?.[1]?.trim() ?? fallback;
}

/** Direct Yahoo quote HTML — avoids Jina rate limits (429) for US/global tickers. */
async function fetchTickerExpenseViaYahooHtml(ticker: string): Promise<ManagementFeeResult> {
  const upper = ticker.toUpperCase();
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(upper)}/`;
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': YF_UA, Accept: 'text/html' } },
    MAYA_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[yahoo-yf-fee] HTTP ${res.status}`);

  const html = await res.text();
  const pct = parseExpensePercentFromYahooHtml(html);
  if (!Number.isFinite(pct)) {
    throw new Error(`[yahoo-yf-fee] No expense ratio for "${upper}".`);
  }

  return {
    id: upper,
    name: parseFundNameFromYahooHtml(html, upper),
    managementFee: pct,
    trusteeFee: null,
    variableFee: null,
    saleLoad: null,
    managerName: '',
    fundType: 'ETF',
    source: 'yahoo-html',
  };
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

async function fetchTerFromJustEtf(
  isin: string,
  tickerHint?: string,
  jinaApiKey?: string,
): Promise<number> {
  const content = await fetchJinaPage(
    `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`,
    jinaApiKey,
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

async function resolveTerViaJustEtf(
  ticker: string,
  jinaContent: string,
  jinaApiKey?: string,
): Promise<number> {
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
      return await fetchTerFromJustEtf(isin, ticker, jinaApiKey);
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

async function fetchTickerExpenseViaJina(
  ticker: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  const upper = ticker.toUpperCase();
  const pageUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(upper)}/`;
  let content: string;
  let title: string | undefined;
  try {
    ({ content, title } = await fetchJinaReaderPage(
      pageUrl,
      jinaReaderFetchOptions(jinaApiKey, JINA_TIMEOUT_MS),
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      msg.startsWith('[jina]') ? msg.replace('[jina]', '[jina-yf-fee]') : `[jina-yf-fee] ${msg}`,
    );
  }
  const nameMatch = (title ?? '').match(/^(.+?)\s*\(/);
  const name = nameMatch?.[1]?.trim() ?? upper;

  const yahooMatch = EXPENSE_RATIO_MARKER.exec(content);
  let pct = yahooMatch?.[1] ? parseFloat(yahooMatch[1]) : NaN;
  let source = 'yahoo-jina';

  if (!Number.isFinite(pct)) {
    pct = await resolveTerViaJustEtf(upper, content, jinaApiKey);
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

async function fetchTickerExpense(
  ticker: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  const errors: string[] = [];
  try {
    return await fetchTickerExpenseViaYahooHtml(ticker);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  try {
    return await fetchTickerExpenseViaJina(ticker, jinaApiKey);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  throw new Error(errors.join('\n'));
}

/**
 * TASE numeric id → Maya; ticker → Yahoo HTML, then Jina / justETF fallbacks.
 */
export async function fetchManagementFee(
  id: string,
  jinaApiKey?: string,
): Promise<ManagementFeeResult> {
  if (/^\d+$/.test(id)) {
    return fetchTaseManagementFee(id, jinaApiKey);
  }
  return fetchTickerExpense(id, jinaApiKey);
}
