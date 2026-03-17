import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchEtfQuote } from '../services/etf.js';
import { etfQuerySchema } from '../schemas/index.js';

/** Prices are cached at Cloudflare's edge for this many seconds. */
const CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * GET /etf?id=<security_number>[&format=json|text]
 *
 * Returns the current price of an Israeli ETF/fund by its TASE security number.
 * Protected by auth middleware.
 *
 * Responses are cached at Cloudflare's edge for 10 minutes, keyed by security ID.
 * This dramatically reduces upstream requests and avoids rate-limiting or IP blocks.
 *
 * JSON response: { id, name, price, currency, date, source }
 * Text response: plain number (e.g. "576.15") — suitable for IMPORTDATA in Google Sheets.
 */
export async function etfController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = etfQuerySchema.safeParse({
    id: c.req.query('id'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { id, format } = parsed.data;

  // Use a secret-free cache key so all callers share the same cached price.
  const cacheKey = new Request(`https://cache.internal/etf/${id}/${format ?? 'text'}`);
  // caches.default is a Cloudflare Workers global — not available in test environments
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const quote = await fetchEtfQuote(id);
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

    // Clone before caching — Response body can only be consumed once
    if (cache) {
      await cache.put(cacheKey, response.clone());
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found') ? 404 : 502;
    return c.json({ error: message }, status);
  }
}
