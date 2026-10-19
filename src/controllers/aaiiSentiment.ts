import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchAaiiSentiment } from '../services/aaiiSentiment.js';
import { aaiiSentimentQuerySchema } from '../schemas/index.js';
import { resolveTextJsonFormat } from '../utils/responseFormat.js';
import type { AaiiSentimentResult } from '../types/aaiiSentiment.js';

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const STALE_CACHE_TTL_SECONDS = 365 * 24 * 60 * 60;

function aaiiCacheKeys(weeks: number, format: string): { fresh: Request; stale: Request } {
  const base = `https://cache.internal/aaii-sentiment/${weeks}/${format}`;
  return {
    fresh: new Request(base),
    stale: new Request(`${base}/stale`),
  };
}

async function putAaiiCaches(
  cache: Cache | null,
  keys: ReturnType<typeof aaiiCacheKeys>,
  response: Response,
): Promise<void> {
  if (!cache) return;
  await cache.put(keys.fresh, response.clone());
  const staleHeaders = new Headers(response.headers);
  staleHeaders.set('Cache-Control', `public, max-age=${STALE_CACHE_TTL_SECONDS}`);
  await cache.put(
    keys.stale,
    new Response(await response.clone().arrayBuffer(), {
      status: response.status,
      headers: staleHeaders,
    }),
  );
}

function staleResponse(stale: Response): Response {
  const headers = new Headers(stale.headers);
  headers.set('X-Aaii-Cache', 'stale');
  return new Response(stale.body, { status: stale.status, headers });
}

function buildAaiiResponse(
  c: Context<{ Bindings: Env }>,
  result: AaiiSentimentResult,
  format: string,
): Response {
  const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;
  if (format === 'text') {
    const latest = result.weeks[0];
    const text = latest ? String(latest.bullish) : '';
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': cacheControl,
      },
    });
  }
  return c.json(result, 200, { 'Cache-Control': cacheControl });
}

async function refreshAaiiAndCache(
  c: Context<{ Bindings: Env }>,
  weeks: number,
  format: string,
  keys: ReturnType<typeof aaiiCacheKeys>,
  cache: Cache | null,
): Promise<Response> {
  const result = await fetchAaiiSentiment(weeks, c.env.JINA_API_KEY);
  const response = buildAaiiResponse(c, result, format);
  await putAaiiCaches(cache, keys, response);
  return response;
}

/**
 * GET /aaii-sentiment?weeks=5&format=json
 */
export async function aaiiSentimentController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = aaiiSentimentQuerySchema.safeParse({
    weeks: c.req.query('weeks'),
    format: resolveTextJsonFormat(c.req.query('format'), c.req.header('Accept')),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { weeks, format } = parsed.data;
  const keys = aaiiCacheKeys(weeks, format);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(keys.fresh);
  if (cached) return cached;

  const stale = await cache?.match(keys.stale);
  if (stale) {
    c.executionCtx?.waitUntil(
      refreshAaiiAndCache(c, weeks, format, keys, cache).catch(() => undefined),
    );
    return staleResponse(stale);
  }

  try {
    return await refreshAaiiAndCache(c, weeks, format, keys, cache);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
