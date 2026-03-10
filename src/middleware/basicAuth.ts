import { MiddlewareHandler } from 'hono';
import { Env } from '../types/index.js';

/**
 * URL key middleware — protects the UI with ?key=SECRET_KEY in the URL.
 * Works with bookmarks and Google Sheets IMPORTDATA (no browser prompt).
 */
export const basicAuthMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.query('key') === c.env.SECRET_KEY) {
    return next();
  }
  return c.text('Forbidden — add ?key=YOUR_SECRET to the URL.', 403);
};
