import type { CookieOptions } from 'hono/utils/cookie';
import { sessionCookieMaxAgeSeconds } from './session.js';

/** HttpOnly session cookie flags for UI auth. */
export function uiSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionCookieMaxAgeSeconds(),
  };
}
