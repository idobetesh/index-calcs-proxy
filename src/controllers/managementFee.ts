import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchManagementFee } from '../services/managementFee.js';
import { etfQuerySchema } from '../schemas/index.js';

const CACHE_TTL_SECONDS = 24 * 60 * 60; // fees change rarely

/**
 * GET /mgmt-fee?id=<id>[&format=json|text]
 *
 * Returns annual management fee (דמי ניהול) as percent (0.25 = 0.25%).
 * TASE ids: Maya mutual/ETF. Tickers: Yahoo HTML expense ratio, Jina/justETF fallback.
 */
export async function managementFeeController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = etfQuerySchema.safeParse({
    id: c.req.query('id'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { id, format } = parsed.data;
  const partRaw = c.req.query('part');
  const part = partRaw === 'trustee' || partRaw === 'variable' ? partRaw : 'management';

  const cacheKey = new Request(`https://cache.internal/mgmt-fee/${id}/${format ?? 'text'}/${part}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  try {
    const fee = await fetchManagementFee(id);
    const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`;

    let textValue = String(fee.managementFee);
    if (part === 'trustee') {
      if (fee.trusteeFee == null) {
        return c.json({ error: 'No trustee fee for this security.' }, 404);
      }
      textValue = String(fee.trusteeFee);
    } else if (part === 'variable') {
      if (fee.variableFee == null) {
        return c.json({ error: 'No variable fee for this security.' }, 404);
      }
      textValue = String(fee.variableFee);
    }

    const response =
      format === 'json'
        ? c.json(fee, 200, { 'Cache-Control': cacheControl })
        : new Response(textValue, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': cacheControl,
            },
          });

    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found') || message.includes('No expense') ? 404 : 502;
    return c.json({ error: message }, status);
  }
}
