import { Context } from 'hono';
import { getAllMarketStatuses, getMarketStatus, MARKETS } from '../services/marketHours.js';
import { marketStatusQuerySchema } from '../schemas/index.js';

export async function marketStatusController(c: Context): Promise<Response> {
  const parsed = marketStatusQuerySchema.safeParse({
    market: c.req.query('market'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { market, format } = parsed.data;
  const now = new Date();

  if (market !== undefined) {
    const status = await getMarketStatus(MARKETS[market], now);
    if (format === 'text') {
      return new Response(String(status.open), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return c.json(status, 200, { 'Cache-Control': 'no-store' });
  }

  const all = await getAllMarketStatuses(now);
  return c.json(all, 200, { 'Cache-Control': 'no-store' });
}
