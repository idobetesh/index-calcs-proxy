import { Context } from 'hono';
import { Env } from '../types/env.js';
import { searchStocks } from '../services/stock.js';
import { stockSearchQuerySchema } from '../schemas/index.js';

/**
 * GET /stock/search?q=<query>
 *
 * Searches Yahoo Finance for stocks and ETFs matching the query.
 * Returns up to 8 results: [{ ticker, name, exchange, type }]
 * Protected by auth middleware.
 */
export async function stockSearchController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = stockSearchQuerySchema.safeParse({ q: c.req.query('q') });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  try {
    const results = await searchStocks(parsed.data.q);
    return c.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
