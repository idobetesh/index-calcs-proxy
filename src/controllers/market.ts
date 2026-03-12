import { Context } from 'hono';
import { QuoteResult } from '../types/market.js';

/**
 * Fetches a single Stooq CSV quote.
 * Response columns: Symbol,Date,Time,Open,High,Low,Close,Volume
 */
async function stooqQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, { headers: { 'User-Agent': 'curl/8.0' } });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split('\n');
    // lines[0] = header, lines[1] = data row
    const row = lines[1]?.split(',');
    if (!row || row[6] === 'N/D') return null;
    const close = parseFloat(row[6] ?? '');
    const open = parseFloat(row[3] ?? ''); // Open as proxy for prev close
    if (isNaN(close)) return null;
    const change = open ? +(((close - open) / open) * 100).toFixed(2) : 0;
    return { price: close, change };
  } catch {
    return null;
  }
}

/**
 * Fetches VIX from CBOE's public daily history CSV.
 * Columns: Date,Open,High,Low,Close
 * Returns latest close and day-over-day change.
 */
async function cboeVix(): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
      {
        headers: { 'User-Agent': 'curl/8.0' },
      },
    );
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split('\n');
    // Last two data rows for change calculation
    const last = lines[lines.length - 1]?.split(',');
    const prev = lines[lines.length - 2]?.split(',');
    if (!last) return null;
    const price = parseFloat(last[4] ?? ''); // Close column
    const prevClose = prev ? parseFloat(prev[4] ?? '') : NaN;
    if (isNaN(price)) return null;
    const change =
      !isNaN(prevClose) && prevClose ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : 0;
    return { price, change };
  } catch {
    return null;
  }
}

/**
 * GET /market — public, no auth.
 * Proxies market data server-side (avoids browser CORS restrictions).
 * Gold/Silver: Stooq real-time quotes.
 * VIX: CBOE daily history.
 */
export async function marketController(c: Context): Promise<Response> {
  const [gold, silver, vix, sp500, nasdaq, russell, msci] = await Promise.all([
    stooqQuote('xauusd'),
    stooqQuote('xagusd'),
    cboeVix(),
    stooqQuote('^spx'),
    stooqQuote('^ndx'),
    stooqQuote('iwm.us'), // Russell 2000 via iShares ETF
    stooqQuote('acwi.us'), // MSCI ACWI via iShares ETF
  ]);

  return c.json({ gold, silver, vix, sp500, nasdaq, russell, msci }, 200, {
    'Cache-Control': 'public, max-age=300',
  });
}
