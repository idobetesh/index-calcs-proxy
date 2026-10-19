import { getCookie } from 'hono/cookie';
import { Context, Next } from 'hono';
import { Env } from '../types/env.js';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../utils/session.js';

/**
 * Timing-safe string comparison using HMAC via crypto.subtle.
 * Avoids leaking secret length via early-exit.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('hmac-key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
  ]);
  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  if (arrA.length !== arrB.length) return false;
  let diff = 0;
  for (let i = 0; i < arrA.length; i++) {
    diff |= (arrA[i] ?? 0) ^ (arrB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Auth middleware. Accepts:
 * 1. ?secret= query param (legacy IMPORTDATA / bookmarks)
 * 2. Authorization: Bearer <SECRET_KEY> (Apps Script, curl)
 * 3. HttpOnly session cookie (calculator UI after ?key= login)
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<Response> {
  const expectedSecret = c.env.SECRET_KEY;

  if (!expectedSecret) {
    return c.json({ error: 'Server misconfiguration: SECRET_KEY not set' }, 500);
  }

  const querySecret = c.req.query('secret') ?? '';
  const authHeader = c.req.header('Authorization') ?? '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const candidate = querySecret || bearerSecret;
  if (candidate) {
    const valid = await timingSafeEqual(candidate, expectedSecret);
    if (!valid) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
    return c.res;
  }

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken && (await verifySessionToken(expectedSecret, sessionToken))) {
    await next();
    return c.res;
  }

  return c.json({ error: 'Unauthorized' }, 401);
}
