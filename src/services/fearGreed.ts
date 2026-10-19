import { FearGreedMarket, FearGreedResult } from '../types/fearGreed.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { fetchJinaReaderPage, jinaReaderFetchOptions } from '../utils/jina.js';

const CRYPTO_FNG_URL = 'https://api.alternative.me/fng/?limit=1';
const CNN_FNG_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

const JINA_STOCKS_PAGE = 'https://feargreedmeter.com/';
const JINA_CRYPTO_PAGE = 'https://feargreedmeter.com/crypto';

const STOCK_INDEX_MARKER =
  /fear-and-greed-index\)\s*\n+\s*(\d{1,3})\s*\n+\s*(Extreme Fear|Fear|Neutral|Greed|Extreme Greed)/i;
const CRYPTO_INDEX_MARKER =
  /crypto-fear-and-greed-index\)\s*\n+\s*(\d{1,3})\s*\n+\s*(Extreme Fear|Fear|Neutral|Greed|Extreme Greed)/i;

/**
 * CNN Business bands on the raw 0–100 score (stocks only — fallback when CNN JSON has no rating).
 * @see https://www.cnn.com/markets/fear-and-greed
 */
export function classifyCnnFearGreedValue(score: number): string {
  if (score < 25) return 'Extreme Fear';
  if (score < 45) return 'Fear';
  if (score < 55) return 'Neutral';
  if (score < 75) return 'Greed';
  return 'Extreme Greed';
}

/** Headline index as shown on CNN (rounded). */
export function cnnDisplayScore(score: number): number {
  return Math.round(score);
}

export function normalizeFearGreedRating(label: string): string {
  return label.trim().toLowerCase();
}

function unixSecondsToIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const sec = parseInt(raw, 10);
  if (!Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

function buildResult(
  market: FearGreedMarket,
  value: number,
  ratingLabel: string,
  source: string,
  timestamp: string,
): FearGreedResult {
  return {
    market,
    value,
    rating: normalizeFearGreedRating(ratingLabel),
    source,
    timestamp,
  };
}

function parseStockIndexFromJina(content: string): { value: number; ratingLabel: string } | null {
  const match = STOCK_INDEX_MARKER.exec(content);
  if (!match) return null;
  const value = parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const ratingLabel = match[2] ?? classifyCnnFearGreedValue(value);
  return { value, ratingLabel };
}

function parseCryptoIndexFromJina(content: string): { value: number; ratingLabel: string } | null {
  const match = CRYPTO_INDEX_MARKER.exec(content);
  if (!match) return null;
  const value = parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const ratingLabel = match[2]?.trim();
  if (!ratingLabel) return null;
  return { value, ratingLabel };
}

async function fetchJinaContent(pageUrl: string, jinaApiKey?: string): Promise<string> {
  const { content } = await fetchJinaReaderPage(pageUrl, jinaReaderFetchOptions(jinaApiKey));
  if (!content) throw new Error('Jina response: missing content');
  return content;
}

async function fetchCryptoFromAlternativeMe(): Promise<FearGreedResult> {
  const res = await fetchWithTimeout(CRYPTO_FNG_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' },
  });
  if (!res.ok) throw new Error(`alternative.me FNG returned HTTP ${res.status}`);

  const json: {
    data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>;
  } = await res.json();
  const row = json.data?.[0];
  const value = parseInt(row?.value ?? '', 10);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('alternative.me FNG: invalid value');
  }

  const ratingLabel = row?.value_classification?.trim();
  if (!ratingLabel) {
    throw new Error('alternative.me FNG: missing value_classification');
  }
  const timestamp = unixSecondsToIso(row?.timestamp) ?? new Date().toISOString();
  return buildResult('crypto', value, ratingLabel, 'alternative.me', timestamp);
}

async function fetchCryptoFromJina(jinaApiKey?: string): Promise<FearGreedResult> {
  const content = await fetchJinaContent(JINA_CRYPTO_PAGE, jinaApiKey);
  const parsed = parseCryptoIndexFromJina(content);
  if (!parsed) throw new Error('Could not parse crypto Fear & Greed from fallback page');
  const timestamp = new Date().toISOString();
  return buildResult('crypto', parsed.value, parsed.ratingLabel, 'feargreedmeter-jina', timestamp);
}

async function fetchStocksFromCnn(): Promise<FearGreedResult | null> {
  const res = await fetchWithTimeout(CNN_FNG_URL, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.cnn.com/markets/fear-and-greed',
      Origin: 'https://www.cnn.com',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) return null;

  const text = await res.text();
  if (/teapot|bot/i.test(text)) return null;

  let json: { fear_and_greed?: { score?: number; rating?: string; timestamp?: string } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return null;
  }

  const score = json.fear_and_greed?.score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return null;
  }

  const value = cnnDisplayScore(score);
  const apiRating = json.fear_and_greed?.rating?.trim();
  const ratingLabel = apiRating || classifyCnnFearGreedValue(score);
  const timestamp = json.fear_and_greed?.timestamp?.trim() || new Date().toISOString();

  return buildResult('stocks', value, ratingLabel, 'cnn', timestamp);
}

async function fetchStocksFromJina(jinaApiKey?: string): Promise<FearGreedResult> {
  const content = await fetchJinaContent(JINA_STOCKS_PAGE, jinaApiKey);
  const parsed = parseStockIndexFromJina(content);
  if (!parsed) throw new Error('Could not parse stock Fear & Greed from fallback page');
  const timestamp = new Date().toISOString();
  return buildResult('stocks', parsed.value, parsed.ratingLabel, 'feargreedmeter-jina', timestamp);
}

export async function fetchFearGreed(
  market: FearGreedMarket,
  jinaApiKey?: string,
): Promise<FearGreedResult> {
  if (market === 'crypto') {
    try {
      return await fetchCryptoFromAlternativeMe();
    } catch {
      return fetchCryptoFromJina(jinaApiKey);
    }
  }

  const cnn = await fetchStocksFromCnn();
  if (cnn) return cnn;
  return fetchStocksFromJina(jinaApiKey);
}
