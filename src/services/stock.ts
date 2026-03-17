import { fetchWithTimeout } from '../utils/fetch.js';
import { StockQuote, StockSearchResult, YahooChartMeta, YahooSearchQuote } from '../types/stock.js';

export type { StockQuote, StockSearchResult };

const TIMEOUT_MS = 8_000;

const YF_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const YF_HEADERS = {
  Accept: 'application/json',
  'User-Agent': YF_UA,
};

/**
 * Source 1: Yahoo Finance chart API.
 * Works without crumb auth. Returns price in meta.regularMarketPrice.
 */
async function fetchViaChart(ticker: string): Promise<StockQuote> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetchWithTimeout(url, { headers: YF_HEADERS }, TIMEOUT_MS);
  if (!res.ok) throw new Error(`[yf-chart] HTTP ${res.status}`);

  const json = (await res.json()) as { chart?: { result?: Array<{ meta?: YahooChartMeta }> } };
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`[yf-chart] Ticker "${ticker}" not found.`);

  const price = meta.regularMarketPrice;
  if (price == null) throw new Error(`[yf-chart] No price for "${ticker}".`);

  const date = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : '';

  return {
    ticker: meta.symbol ?? ticker,
    name: meta.shortName ?? ticker,
    price,
    currency: meta.currency ?? 'USD',
    exchange: meta.fullExchangeName ?? '',
    date,
  };
}

/**
 * Source 2: Jina-rendered Yahoo Finance quote page.
 * Fallback when the direct API fails.
 * Price appears near the top as a standalone number (e.g. "150.25").
 */
async function fetchViaJina(ticker: string): Promise<StockQuote> {
  const pageUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;
  const res = await fetchWithTimeout(
    `https://r.jina.ai/${pageUrl}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[jina-yf] HTTP ${res.status}`);

  const json = (await res.json()) as { data?: { content?: string; title?: string } };
  const content = json?.data?.content ?? '';

  // Yahoo Finance quote pages rendered by Jina show the price as a bold number
  // near the top, e.g. "**150.25**" or as a plain decimal like "150.25" on its own line.
  const m = content.match(/\*\*([\d,]+\.?\d*)\*\*/) ?? content.match(/\n([\d,]{1,7}\.?\d{0,4})\n/);
  const price = m?.[1] ? parseFloat(m[1].replace(/,/g, '')) : null;
  if (!price || isNaN(price) || price <= 0) {
    throw new Error(`[jina-yf] Could not parse price for "${ticker}".`);
  }

  // Extract a name from the page title ("Apple Inc. (AAPL) Stock Price…")
  const title = json?.data?.title ?? '';
  const nameMatch = title.match(/^(.+?)\s*\(/);
  const name = nameMatch?.[1]?.trim() ?? ticker;

  return { ticker, name, price, currency: '', exchange: '', date: '' };
}

export async function fetchStockQuote(ticker: string): Promise<StockQuote> {
  try {
    return await fetchViaChart(ticker);
  } catch (chartErr) {
    try {
      return await fetchViaJina(ticker);
    } catch (jinaErr) {
      const msg1 = chartErr instanceof Error ? chartErr.message : String(chartErr);
      const msg2 = jinaErr instanceof Error ? jinaErr.message : String(jinaErr);
      const notFound = [msg1, msg2].every(
        (e) => e.includes('404') || e.includes('not found') || e.includes('parse price'),
      );
      if (notFound) throw new Error(`Ticker "${ticker}" not found. Please check the symbol.`);
      throw new Error(`All sources failed for "${ticker}":\n${msg1}\n${msg2}`);
    }
  }
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`;
  const res = await fetchWithTimeout(url, { headers: YF_HEADERS }, TIMEOUT_MS);
  if (!res.ok) throw new Error(`Yahoo Finance search returned HTTP ${res.status}`);

  const json = (await res.json()) as { quotes?: YahooSearchQuote[] };
  const quotes = json?.quotes ?? [];

  return quotes
    .filter((q) => q.symbol && (q.shortname ?? q.longname))
    .map((q) => ({
      ticker: q.symbol!,
      name: q.shortname ?? q.longname ?? q.symbol!,
      exchange: q.exchDisp ?? q.exchange ?? '',
      type: q.quoteType ?? 'EQUITY',
    }));
}
