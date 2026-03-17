import { z } from 'zod';

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const calcQuerySchema = z.object({
  amount: z.coerce
    .number({ message: 'Invalid or missing "amount". Must be a positive number.' })
    .positive({ message: 'Invalid or missing "amount". Must be a positive number.' }),
  from: z
    .string({ message: 'Invalid or missing "from". Expected YYYY-MM format.' })
    .regex(PERIOD_REGEX, 'Invalid or missing "from". Expected YYYY-MM format.'),
  to: z.string().regex(PERIOD_REGEX, 'Invalid "to". Expected YYYY-MM format.').optional(),
  index: z
    .enum(['cpi', 'construction', 'housing'] as const, {
      message: 'Invalid "index". Must be one of: cpi, construction, housing.',
    })
    .default('cpi'),
  format: z.enum(['text', 'json'] as const).default('text'),
});

export const etfQuerySchema = z.object({
  id: z
    .string()
    .regex(
      /^(\d{6,10}|[A-Za-z][A-Za-z0-9.\-]{0,19})$/,
      'Missing or invalid "id". Must be a TASE security number (6–10 digits) or a ticker symbol (e.g. AAPL, TEVA.TA).',
    ),
  format: z.enum(['text', 'json'] as const).default('text'),
});

export const marketStatusQuerySchema = z.object({
  market: z
    .enum(['tase', 'lse', 'nyse', 'six'] as const, {
      message: 'Invalid "market". Must be one of: tase, lse, nyse, six.',
    })
    .optional(),
  format: z.enum(['text', 'json'] as const).default('json'),
});

export const stockQuerySchema = z.object({
  ticker: z
    .string()
    .regex(
      /^[A-Za-z0-9.\-]{1,20}$/,
      'Missing or invalid "ticker". Must be a valid stock/ETF symbol (e.g. AAPL, TEVA.TA, BRK-B).',
    ),
  format: z.enum(['text', 'json'] as const).default('json'),
});

export const stockSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'Search query "q" is required.')
    .max(50, 'Search query too long.')
    .regex(
      /^[A-Za-z0-9.\- ]+$/,
      'Search query must contain only letters, numbers, spaces, dots, or hyphens.',
    ),
});

export type CalcQuery = z.infer<typeof calcQuerySchema>;
export type EtfQuery = z.infer<typeof etfQuerySchema>;
export type MarketStatusQuery = z.infer<typeof marketStatusQuerySchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export type StockSearchQuery = z.infer<typeof stockSearchQuerySchema>;
