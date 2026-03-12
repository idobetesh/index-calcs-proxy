import { Context } from 'hono';
import { Env } from '../types/env.js';
import { IndexType } from '../types/cbs.js';
import { CalcParams, CalcResult } from '../types/calc.js';
import { isValidPeriod, isPeriodBefore } from '../utils/format.js';
import { calculateCpi } from '../calculations/cpi.js';
import { calculateConstruction } from '../calculations/construction.js';
import { calculateHousing } from '../calculations/housing.js';
import { latestEntry, fetchIndexData } from '../services/cbs.js';

type CalcFn = (params: CalcParams) => Promise<CalcResult>;

const CALCULATORS: Record<IndexType, CalcFn> = {
  cpi: calculateCpi,
  construction: calculateConstruction,
  housing: calculateHousing,
};

const VALID_INDEX_TYPES: IndexType[] = ['cpi', 'construction', 'housing'];
const VALID_FORMATS = ['text', 'json'] as const;

function isIndexType(value: string): value is IndexType {
  return (VALID_INDEX_TYPES as string[]).includes(value);
}

/**
 * Controller for GET /calc.
 * Parses and validates query params, dispatches to the appropriate
 * calculation service, and returns text/plain or JSON.
 */
export async function calcController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const amountStr = c.req.query('amount') ?? '';
  const fromStr = c.req.query('from') ?? '';
  const toStr = c.req.query('to') ?? '';
  const indexStr = c.req.query('index') ?? 'cpi';
  const formatStr = c.req.query('format') ?? 'text';

  // Validate amount
  const amount = Number(amountStr);
  if (!amountStr || isNaN(amount) || amount <= 0) {
    return c.json({ error: 'Invalid or missing "amount". Must be a positive number.' }, 400);
  }

  // Validate from
  if (!fromStr || !isValidPeriod(fromStr)) {
    return c.json({ error: 'Invalid or missing "from". Expected YYYY-MM format.' }, 400);
  }

  // Validate to (optional)
  let toPeriod = toStr;
  if (toStr && !isValidPeriod(toStr)) {
    return c.json({ error: 'Invalid "to". Expected YYYY-MM format.' }, 400);
  }

  // Resolve to period: default to latest available
  if (!toPeriod) {
    try {
      const indexType = isIndexType(indexStr) ? indexStr : 'cpi';
      const entries = await fetchIndexData(indexType);
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

  // Validate index type
  if (!isIndexType(indexStr)) {
    return c.json(
      { error: `Invalid "index". Must be one of: ${VALID_INDEX_TYPES.join(', ')}` },
      400,
    );
  }

  // Validate format
  const format = VALID_FORMATS.includes(formatStr as 'text' | 'json')
    ? (formatStr as 'text' | 'json')
    : 'text';

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
