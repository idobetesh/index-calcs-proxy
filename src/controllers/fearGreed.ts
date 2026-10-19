import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchFearGreed } from '../services/fearGreed.js';
import { fearGreedQuerySchema } from '../schemas/index.js';
import { resolveTextJsonFormat } from '../utils/responseFormat.js';

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * GET /fear-greed?market=crypto|stocks[&format=text|json]
 */
export async function fearGreedController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = fearGreedQuerySchema.safeParse({
    market: c.req.query('market'),
    format: resolveTextJsonFormat(c.req.query('format'), c.req.header('Accept')),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { market, format } = parsed.data;
  const cacheKey = new Request(`https://cache.internal/fear-greed/${market}/${format}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const result = await fetchFearGreed(market, c.env.JINA_API_KEY);
    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;

    const response =
      format === 'text'
        ? new Response(String(result.value), {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': cacheControl,
            },
          })
        : c.json(result, 200, { 'Cache-Control': cacheControl });

    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
