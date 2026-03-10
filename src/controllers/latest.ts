import { Context } from 'hono';
import { Env, IndexType } from '../types/index.js';
import { fetchIndexData, latestEntry } from '../services/cbs.js';

const INDEX_TYPES: IndexType[] = ['cpi', 'construction', 'housing'];

/**
 * Controller for GET /latest — public, no auth.
 * Returns the latest available CBS period for each index type.
 */
export async function latestController(c: Context<{ Bindings: Env }>): Promise<Response> {
  const results = await Promise.all(
    INDEX_TYPES.map(async (index) => {
      try {
        const entries = await fetchIndexData(index);
        const latest = latestEntry(entries);
        return [index, latest?.period ?? null] as const;
      } catch {
        return [index, null] as const;
      }
    }),
  );

  const data = Object.fromEntries(results);
  return c.json(data, 200, { 'Cache-Control': 'public, max-age=3600' });
}
