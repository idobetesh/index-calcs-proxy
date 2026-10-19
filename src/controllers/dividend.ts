import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchDividend } from '../services/dividend.js';
import { etfQuerySchema } from '../schemas/index.js';

const CACHE_TTL_SECONDS = 6 * 60 * 60;

/**
 * GET /dividend?id=<ticker>[&format=json|text][&part=amount|date]
 *
 * JSON: full dividend payload. Text: amount (default) or ISO date with part=date.
 */
export async function dividendController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = etfQuerySchema.safeParse({
    id: c.req.query('id'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { id, format } = parsed.data;
  const part = c.req.query('part') === 'date' ? 'date' : 'amount';

  const cacheKey = new Request(`https://cache.internal/dividend/${id}/${format ?? 'text'}/${part}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const div = await fetchDividend(id, c.env.JINA_API_KEY);
    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;

    const response =
      format === 'json'
        ? c.json(div, 200, { 'Cache-Control': cacheControl })
        : new Response(part === 'date' ? div.nextDate : String(div.amount), {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': cacheControl,
            },
          });

    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message.includes('not supported') ||
      message.includes('not found') ||
      message.includes('No dividend')
        ? 404
        : 502;
    return c.json({ error: message }, status);
  }
}
