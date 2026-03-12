import { Context } from 'hono';
import { Env } from '../types/env.js';
import { fetchEtfQuote } from '../services/etf.js';

const VALID_ID = /^\d{6,10}$/;

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
  const id = c.req.query('id') ?? '';
  if (!VALID_ID.test(id)) {
    return c.json({ error: 'Missing or invalid "id". Must be a 6–10 digit security number.' }, 400);
  }

  const format = c.req.query('format') === 'json' ? 'json' : 'text';

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
    return c.json({ error: message }, 502);
  }
}
