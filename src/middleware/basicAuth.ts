import { getCookie, setCookie } from 'hono/cookie';
import { MiddlewareHandler } from 'hono';
import { Env } from '../types/env.js';
import { uiSessionCookieOptions } from '../utils/cookieOptions.js';
import { SESSION_COOKIE_NAME, createSessionToken, verifySessionToken } from '../utils/session.js';

/**
 * Protects GET /. Accepts ?key=SECRET_KEY once, then HttpOnly session cookie.
 */
export const basicAuthMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const secret = c.env.SECRET_KEY;
  if (!secret) {
    return c.text('Server misconfiguration: SECRET_KEY not set', 500);
  }

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const hasValidSession =
    sessionToken !== undefined && (await verifySessionToken(secret, sessionToken));
  const keyOk = c.req.query('key') === secret;

  if (!hasValidSession && !keyOk) {
    return c.text('Forbidden — add ?key=YOUR_SECRET to the URL.', 403);
  }

  await next();

  if (keyOk) {
    const token = await createSessionToken(secret);
    setCookie(c, SESSION_COOKIE_NAME, token, uiSessionCookieOptions());
  }

  return c.res;
};
