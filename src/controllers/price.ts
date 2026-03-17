import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchTaseQuote } from '../services/tase.js';
import { fetchStockQuote } from '../services/stock.js';
import { etfQuerySchema } from '../schemas/index.js';

/** Prices are cached at Cloudflare's edge for this many seconds. */
const CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * GET /price?id=<id>[&format=json|text]
 *
 * Accepts either:
 *   - A TASE security number (6–10 digits) → fetches from Maya/TASE APIs
 *   - A ticker symbol (e.g. AAPL, TEVA.TA, SPY) → fetches from Yahoo Finance
 *
 * JSON response: { id, name, price, currency, date, source, exchange? }
 * Text response: plain price number — suitable for IMPORTDATA in Google Sheets.
 */
export async function priceController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = etfQuerySchema.safeParse({
    id: c.req.query('id'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { id, format } = parsed.data;

  const cacheKey = new Request(`https://cache.internal/price/${id}/${format ?? 'text'}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const isTase = /^\d+$/.test(id);

  try {
    let quote: Record<string, unknown>;

    if (isTase) {
      const etf = await fetchTaseQuote(id);
      quote = {
        id: etf.id,
        name: etf.name,
        price: etf.price,
        currency: etf.currency,
        date: etf.date,
        source: etf.source,
      };
    } else {
      const stock = await fetchStockQuote(id.toUpperCase());
      quote = {
        id: stock.ticker,
        name: stock.name,
        price: stock.price,
        currency: stock.currency,
        exchange: stock.exchange,
        date: stock.date,
        source: 'yahoo',
      };
    }

    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;
    const response =
      format === 'json'
        ? c.json(quote, 200, { 'Cache-Control': cacheControl })
        : new Response(String(quote.price), {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': cacheControl,
            },
          });

    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found') ? 404 : 502;
    return c.json({ error: message }, status);
  }
}
