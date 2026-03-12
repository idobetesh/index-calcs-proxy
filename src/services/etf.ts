const TIMEOUT_MS = 8_000;

export interface EtfQuote {
  id: string;
  name: string;
  price: number;
  currency: 'ILA'; // אגורות (agurot) — 1/100 of ILS
  date: string;
  source: string;
}

interface MayaFundResponse {
  fundId?: number;
  name?: string;
  purchasePrice?: number;
  redemptionPrice?: number;
  ratesAsOf?: string;
}

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Source 1: Maya TASE mutual funds API.
 * Covers open-ended funds — security IDs typically starting with 5.
 */
async function fetchMayaMutual(id: string): Promise<EtfQuote> {
  const res = await fetchWithTimeout(`https://maya.tase.co.il/api/v1/funds/mutual/${id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
  });
  if (!res.ok) throw new Error(`[maya-mutual] HTTP ${res.status}`);
  const json: unknown = await res.json();
  const data = json as MayaFundResponse;
  const raw = data.purchasePrice ?? data.redemptionPrice;
  if (!raw) throw new Error('[maya-mutual] No price in response');
  return {
    id,
    name: data.name ?? '',
    price: raw,
    currency: 'ILA',
    date: data.ratesAsOf ?? '',
    source: 'maya-mutual',
  };
}

/**
 * Source 2: Maya TASE ETF API.
 * Covers Israeli basket ETFs (קרנות סל) — security IDs typically starting with 1.
 */
async function fetchMayaEtf(id: string): Promise<EtfQuote> {
  const res = await fetchWithTimeout(`https://maya.tase.co.il/api/v1/funds/etf/${id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
  });
  if (!res.ok) throw new Error(`[maya-etf] HTTP ${res.status}`);
  const json: unknown = await res.json();
  const data = json as MayaFundResponse;
  const raw = data.purchasePrice ?? data.redemptionPrice;
  if (!raw) throw new Error('[maya-etf] No price in response');
  return {
    id,
    name: data.name ?? '',
    price: raw,
    currency: 'ILA',
    date: data.ratesAsOf ?? '',
    source: 'maya-etf',
  };
}

/**
 * Attempts to extract a price number from Bizportal's HTML.
 * Tries embedded Next.js JSON (__NEXT_DATA__) first, then regex fallbacks.
 * All Israeli security prices are in agurot (1/100 of ILS).
 */
function parseBizportalHtml(html: string): number {
  // Try __NEXT_DATA__ embedded JSON (Next.js SSR)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch?.[1]) {
    try {
      const flat = nextDataMatch[1];
      const candidates = [
        /"purchasePrice"\s*:\s*([0-9.]+)/,
        /"redemptionPrice"\s*:\s*([0-9.]+)/,
        /"lastPrice"\s*:\s*([0-9.]+)/,
        /"unitValue"\s*:\s*([0-9.]+)/,
        /"closePrice"\s*:\s*([0-9.]+)/,
      ];
      for (const pattern of candidates) {
        const m = flat.match(pattern);
        if (m?.[1]) {
          const p = parseFloat(m[1]);
          if (!isNaN(p) && p > 0) return p;
        }
      }
    } catch {
      // fall through
    }
  }

  // Fallback: scan HTML for Hebrew label → nearby number patterns
  const htmlPatterns = [
    /מחיר פדיון[^<]*<[^>]*>([0-9,]+\.?[0-9]*)/,
    /ערך יחידה[^<]*<[^>]*>([0-9,]+\.?[0-9]*)/,
    /"lastPrice"\s*:\s*([0-9.]+)/,
    /"price"\s*:\s*([0-9.]+)/,
  ];
  for (const pattern of htmlPatterns) {
    const m = html.match(pattern);
    if (m?.[1]) {
      const p = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(p) && p > 0) return p;
    }
  }

  throw new Error('Could not parse price from Bizportal HTML');
}

/**
 * Source 3: Bizportal.co.il HTML scraping.
 * Covers foreign ETFs cross-listed on TASE that are absent from the Maya funds API.
 * Tries the traded-fund view first, then the securities info page.
 */
async function fetchBizportal(id: string): Promise<EtfQuote> {
  const urls = [
    `https://www.bizportal.co.il/tradedfund/quote/generalview/${id}`,
    `https://www.bizportal.co.il/forex/quote/securitiesinfo/${id}`,
  ];

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; curl/8.0)' },
      });
      if (!res.ok) {
        errors.push(`[bizportal] ${url} → HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const price = parseBizportalHtml(html);
      return { id, name: '', price, currency: 'ILA', date: '', source: 'bizportal' };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors.join('; '));
}

/**
 * Fetches the current price for an Israeli ETF/fund by its TASE security number.
 * Tries three sources in order: Maya mutual → Maya ETF → Bizportal.
 * Throws only if all three sources fail.
 */
export async function fetchEtfQuote(id: string): Promise<EtfQuote> {
  const sources: Array<() => Promise<EtfQuote>> = [
    (): Promise<EtfQuote> => fetchMayaMutual(id),
    (): Promise<EtfQuote> => fetchMayaEtf(id),
    (): Promise<EtfQuote> => fetchBizportal(id),
  ];

  const errors: string[] = [];
  for (const source of sources) {
    try {
      return await source();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const allNotFound = errors.every((e) => e.includes('404') || e.includes('parse price'));
  if (allNotFound) {
    throw new Error(`Security "${id}" not found. Please check the TASE security number.`);
  }

  throw new Error(`All sources failed for ETF "${id}":\n${errors.join('\n')}`);
}
