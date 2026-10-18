import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchAaiiSentiment } from '../services/aaiiSentiment.js';
import { aaiiSentimentQuerySchema } from '../schemas/index.js';

const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * GET /aaii-sentiment?weeks=5&format=json
 */
export async function aaiiSentimentController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = aaiiSentimentQuerySchema.safeParse({
    weeks: c.req.query('weeks'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { weeks, format } = parsed.data;
  const cacheKey = new Request(`https://cache.internal/aaii-sentiment/${weeks}/${format}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const result = await fetchAaiiSentiment(weeks);
    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;

    if (format === 'text') {
      const latest = result.weeks[0];
      const text = latest ? String(latest.bullish) : '';
      const response = new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': cacheControl,
        },
      });
      if (cache) await cache.put(cacheKey, response.clone());
      return response;
    }

    const response = c.json(result, 200, { 'Cache-Control': cacheControl });
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
