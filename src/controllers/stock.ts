import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchStockQuote } from '../services/stock.js';
import { stockQuerySchema } from '../schemas/index.js';

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

/**
 * GET /stock?ticker=<symbol>[&format=json|text]
 *
 * Returns the current price of a stock or ETF by its Yahoo Finance ticker symbol.
 * Supports Israeli stocks (e.g. TEVA.TA) and global securities (e.g. AAPL, SPY).
 * Protected by auth middleware.
 */
export async function stockController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = stockQuerySchema.safeParse({
    ticker: c.req.query('ticker'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { ticker, format } = parsed.data;
  const upperTicker = ticker.toUpperCase();

  const cacheKey = new Request(`https://cache.internal/stock/${upperTicker}/${format ?? 'json'}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const quote = await fetchStockQuote(upperTicker);
    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;

    const response =
      format === 'text'
        ? new Response(String(quote.price), {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': cacheControl,
            },
          })
        : c.json(quote, 200, { 'Cache-Control': cacheControl });

    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found') ? 404 : 502;
    return c.json({ error: message }, status);
  }
}
