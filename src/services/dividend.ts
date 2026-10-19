import { DividendResult } from '../types/dividend.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { fetchJinaReaderPage, jinaReaderFetchOptions } from '../utils/jina.js';

const TIMEOUT_MS = 10_000;
const YF_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const JINA_DIVIDEND_DATE =
  /(?:Ex-Dividend Date|Dividend Date)\s*([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i;

interface DivEvent {
  date: Date;
  amount: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseJinaNextDate(content: string): Date | null {
  const match = JINA_DIVIDEND_DATE.exec(content);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function projectNext(events: DivEvent[]): { date: Date; amount: number; estimate: boolean } {
  const now = startOfUtcDay(new Date());
  const sorted = [...events].sort((a, b) => b.date.getTime() - a.date.getTime());
  const past = sorted.filter((e) => startOfUtcDay(e.date) <= now);
  const future = sorted
    .filter((e) => startOfUtcDay(e.date) > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const nextFuture = future[0];
  if (nextFuture) {
    return { date: nextFuture.date, amount: nextFuture.amount, estimate: false };
  }

  const last = past[0];
  if (!last) {
    throw new Error('No dividend history found.');
  }

  if (past.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(4, past.length - 1); i++) {
      const cur = past[i];
      const prev = past[i + 1];
      if (!cur || !prev) continue;
      gaps.push(cur.date.getTime() - prev.date.getTime());
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
    if (median > 0) {
      let projected = new Date(last.date.getTime() + median);
      while (startOfUtcDay(projected) <= now) {
        projected = new Date(projected.getTime() + median);
      }
      return { date: projected, amount: last.amount, estimate: true };
    }
  }

  return { date: last.date, amount: last.amount, estimate: true };
}

async function fetchChartDividends(ticker: string): Promise<{
  events: DivEvent[];
  currency: string;
}> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?events=div&interval=1d&range=5y`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: 'application/json', 'User-Agent': YF_UA } },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[yf-chart-div] HTTP ${res.status}`);

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { currency?: string };
        events?: { dividends?: Record<string, { amount?: number }> };
      }>;
    };
  };
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Ticker "${ticker}" not found.`);

  const currency = result.meta?.currency ?? 'USD';
  const raw = result.events?.dividends ?? {};
  const events: DivEvent[] = [];
  for (const [ts, row] of Object.entries(raw)) {
    const amount = row.amount;
    if (amount == null || !Number.isFinite(amount)) continue;
    events.push({ date: new Date(parseInt(ts, 10) * 1000), amount });
  }
  if (events.length === 0) throw new Error(`No dividends for "${ticker}".`);
  return { events, currency };
}

async function fetchJinaDividendHint(ticker: string, jinaApiKey?: string): Promise<Date | null> {
  const pageUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;
  try {
    const { content } = await fetchJinaReaderPage(
      pageUrl,
      jinaReaderFetchOptions(jinaApiKey, TIMEOUT_MS),
    );
    return parseJinaNextDate(content);
  } catch {
    return null;
  }
}

/**
 * Dividend amount and next date for Yahoo tickers (stocks / ETFs). TASE numeric ids not supported.
 */
export async function fetchDividend(id: string, jinaApiKey?: string): Promise<DividendResult> {
  if (/^\d+$/.test(id)) {
    throw new Error(
      `Dividends for TASE number "${id}" are not supported. Use a ticker (e.g. TEVA.TA).`,
    );
  }

  const ticker = id.toUpperCase();
  const { events, currency } = await fetchChartDividends(ticker);
  const now = startOfUtcDay(new Date());
  const past = events
    .filter((e) => startOfUtcDay(e.date) <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const last = past[0] ?? null;

  let next = projectNext(events);
  const jinaDate = await fetchJinaDividendHint(ticker, jinaApiKey);
  if (jinaDate && startOfUtcDay(jinaDate) > now) {
    next = {
      date: jinaDate,
      amount: last?.amount ?? next.amount,
      estimate: false,
    };
  }

  return {
    id: ticker,
    currency,
    amount: next.amount,
    nextDate: isoDate(next.date),
    lastAmount: last?.amount ?? null,
    lastDate: last ? isoDate(last.date) : null,
    isEstimate: next.estimate,
    source: jinaDate && !next.estimate ? 'yahoo-chart+jina' : 'yahoo-chart',
  };
}
