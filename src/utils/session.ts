/** HttpOnly session cookie for the calculator UI (not the raw API secret). */
export const SESSION_COOKIE_NAME = 'icp_session';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(segment: string): Uint8Array | null {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  try {
    const binary = atob(padded + '='.repeat(padLen));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Signed session value: base64url(exp.nonce).base64url(hmac). */
export async function createSessionToken(signingSecret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${exp}.${crypto.randomUUID()}`;
  const sig = await hmacSha256(signingSecret, payload);
  return `${base64UrlEncode(new TextEncoder().encode(payload))}.${base64UrlEncode(sig)}`;
}

export async function verifySessionToken(signingSecret: string, token: string): Promise<boolean> {
  if (!signingSecret || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const payloadBytes = base64UrlDecode(token.slice(0, dot));
  const sigBytes = base64UrlDecode(token.slice(dot + 1));
  if (!payloadBytes || !sigBytes) return false;

  const payload = new TextDecoder().decode(payloadBytes);
  const expPart = payload.split('.')[0] ?? '';
  const exp = parseInt(expPart, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expectedSig = await hmacSha256(signingSecret, payload);
  return timingSafeEqualBytes(sigBytes, expectedSig);
}

export function sessionCookieMaxAgeSeconds(): number {
  return SESSION_TTL_SECONDS;
}
