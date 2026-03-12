import { Context } from 'hono';
import { type MarketKey } from '../types/market.js';
import {
  getAllMarketStatuses,
  getMarketStatus,
  MARKET_KEYS,
  MARKETS,
} from '../services/marketHours.js';

export async function marketStatusController(c: Context): Promise<Response> {
  const marketParam = c.req.query('market');
  const format = c.req.query('format') === 'text' ? 'text' : 'json';
  const now = new Date();

  if (marketParam !== undefined) {
    if (!MARKET_KEYS.includes(marketParam as MarketKey)) {
      return c.json(
        { error: `Invalid market "${marketParam}". Valid: ${MARKET_KEYS.join(', ')}` },
        400,
      );
    }
    const status = await getMarketStatus(MARKETS[marketParam as MarketKey], now);
    if (format === 'text') {
      return new Response(String(status.open), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return c.json(status, 200, { 'Cache-Control': 'no-store' });
  }

  const all = await getAllMarketStatuses(now);
  return c.json(all, 200, { 'Cache-Control': 'no-store' });
}
