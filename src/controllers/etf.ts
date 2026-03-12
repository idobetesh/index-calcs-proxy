import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchEtfQuote } from '../services/etf.js';
import { etfQuerySchema } from '../schemas/index.js';

/**
 * GET /etf?id=<security_number>[&format=json|text]
 *
 * Returns the current price of an Israeli ETF/fund by its TASE security number.
 * Protected by auth middleware.
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

  try {
    const quote = await fetchEtfQuote(id);

    if (format === 'json') {
      return c.json(quote);
    }

    // Plain text for IMPORTDATA — just the numeric price
    return new Response(String(quote.price), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('not found') ? 404 : 502;
    return c.json({ error: message }, status);
  }
}
