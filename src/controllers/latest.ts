import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchCbsLatestPeriods } from '../services/cbsLatest.js';

const CACHE_TTL_SECONDS = 60 * 60;

/**
 * GET /latest — latest published CBS period (YYYY-MM) per index type.
 */
export async function latestController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cacheKey = new Request('https://cache.internal/cbs-latest/v1');
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const periods = await fetchCbsLatestPeriods();
    const response = c.json(periods, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    });
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
