import { Context } from 'hono';
import { fetchBoiRate } from '../services/boi.js';

export async function rateController(c: Context): Promise<Response> {
  try {
    const result = await fetchBoiRate();
    const format = c.req.query('format') === 'text' ? 'text' : 'json';

    if (format === 'text') {
      return new Response(result.rate.toFixed(2), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
}
