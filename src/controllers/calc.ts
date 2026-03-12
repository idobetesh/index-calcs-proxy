import { Context } from 'hono';
import { Env } from '../types/env.js';
import { CalcParams, CalcResult } from '../types/calc.js';
import { isPeriodBefore } from '../utils/format.js';
import { calculateCpi } from '../calculations/cpi.js';
import { calculateConstruction } from '../calculations/construction.js';
import { calculateHousing } from '../calculations/housing.js';
import { latestEntry, fetchIndexData } from '../services/cbs.js';
import { calcQuerySchema } from '../schemas/index.js';
import { IndexType } from '../types/cbs.js';

type CalcFn = (params: CalcParams) => Promise<CalcResult>;

const CALCULATORS: Record<IndexType, CalcFn> = {
  cpi: calculateCpi,
  construction: calculateConstruction,
  housing: calculateHousing,
};

/**
 * Controller for GET /calc.
 * Parses and validates query params, dispatches to the appropriate
 * calculation service, and returns text/plain or JSON.
 */
export async function calcController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = calcQuerySchema.safeParse({
    amount: c.req.query('amount'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    index: c.req.query('index'),
    format: c.req.query('format'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const { amount, from: fromStr, index: indexStr, format } = parsed.data;
  let toPeriod = parsed.data.to ?? '';

  // Resolve to period: default to latest available
  if (!toPeriod) {
    try {
      const entries = await fetchIndexData(indexStr);
      const latest = latestEntry(entries);
      if (!latest) {
        return c.json({ error: 'Could not determine latest index period.' }, 502);
      }
      toPeriod = latest.period;
    } catch (err) {
      return c.json(
        { error: `CBS API error: ${err instanceof Error ? err.message : String(err)}` },
        502,
      );
    }
  }

  if (!isPeriodBefore(fromStr, toPeriod)) {
    return c.json({ error: '"from" must be earlier than "to".' }, 400);
  }

  const params: CalcParams = {
    amount,
    from: fromStr,
    to: toPeriod,
    index: indexStr,
    format,
  };

  try {
    const calculator = CALCULATORS[indexStr];
    const result = await calculator(params);

    if (format === 'json') {
      return c.json(result);
    }

    // Plain text for Google Sheets IMPORTDATA — two lines, pure numbers, no symbols.
    // Line 1: indexed amount (integer). Line 2: percentage as decimal fraction (e.g. 0.0302)
    // so TEXT(value, "0.00%") in Sheets renders correctly as "3.02%".
    const plainText = `${result.indexedAmount}\n${(result.percentage / 100).toFixed(4)}`;
    return new Response(plainText, {
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
