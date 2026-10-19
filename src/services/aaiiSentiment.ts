import { AaiiSentimentResult, AaiiSentimentWeek } from '../types/aaiiSentiment.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { jinaReaderHeaders, jinaReaderUrl } from '../utils/jina.js';

const JINA_TIMEOUT_MS = 25_000;
const JINA_RETRY_DELAY_MS = 1_500;
const AAII_RESULTS_URL = 'https://www.aaii.com/sentimentsurvey/sent_results';
const AAII_XLS_URL = 'https://www.aaii.com/files/surveys/sentiment.xls';

const ROW_RE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+([\d.]+)%([\d.]+)%([\d.]+)%/gm;

/** Jina markdown from sentiment.xls — `**10-15-26****38.73%****19.65%****41.62%` */
const XLS_ROW_RE =
  /\*\*(\d{1,2})-(\d{1,2})-(\d{2})\*\*\*\*(\d+(?:\.\d+)?)%\*\*\*\*(\d+(?:\.\d+)?)%\*\*\*\*(\d+(?:\.\d+)?)%/g;

const MONTH_ABBR: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function monthDayToWeekEndingIso(monthAbbr: string, day: number, ref: Date): string {
  const month = MONTH_ABBR[monthAbbr];
  if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) {
    throw new Error(`Invalid AAII date: ${monthAbbr} ${day}`);
  }
  let year = ref.getUTCFullYear();
  let candidate = Date.UTC(year, month, day, 12, 0, 0);
  const refMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 12, 0, 0);
  if (candidate > refMs + 7 * 86_400_000) {
    year -= 1;
    candidate = Date.UTC(year, month, day, 12, 0, 0);
  }
  const d = new Date(candidate);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function mdyShortToWeekEndingIso(month: number, day: number, year2: number): string {
  if (!Number.isFinite(month) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid AAII date: ${month}/${day}/${year2}`);
  }
  const year = year2 >= 70 ? 1900 + year2 : 2000 + year2;
  const m = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${m}-${dd}`;
}

/** Parse Jina-rendered AAII sent_results markdown (newest weeks first). */
export function parseAaiiSentimentFromContent(
  content: string,
  weeks: number,
  refDate: Date = new Date(),
): AaiiSentimentWeek[] {
  const limit = Math.max(1, Math.min(weeks, 52));
  const out: AaiiSentimentWeek[] = [];
  ROW_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROW_RE.exec(content)) !== null && out.length < limit) {
    const month = match[1];
    const day = match[2];
    const bullish = parseFloat(match[3] ?? '');
    const neutral = parseFloat(match[4] ?? '');
    const bearish = parseFloat(match[5] ?? '');
    if (
      !month ||
      !day ||
      !Number.isFinite(bullish) ||
      !Number.isFinite(neutral) ||
      !Number.isFinite(bearish)
    ) {
      continue;
    }
    out.push({
      weekEnding: monthDayToWeekEndingIso(month, parseInt(day, 10), refDate),
      bullish,
      neutral,
      bearish,
    });
  }
  if (out.length === 0) {
    throw new Error('No AAII sentiment rows found in page content');
  }
  return out;
}

/** Parse Jina-rendered AAII sentiment.xls (rows chronological; returns newest first). */
export function parseAaiiSentimentFromXlsContent(
  content: string,
  weeks: number,
): AaiiSentimentWeek[] {
  const limit = Math.max(1, Math.min(weeks, 52));
  const rows: AaiiSentimentWeek[] = [];
  XLS_ROW_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = XLS_ROW_RE.exec(content)) !== null) {
    const month = parseInt(match[1] ?? '', 10);
    const day = parseInt(match[2] ?? '', 10);
    const yy = parseInt(match[3] ?? '', 10);
    const bullish = parseFloat(match[4] ?? '');
    const neutral = parseFloat(match[5] ?? '');
    const bearish = parseFloat(match[6] ?? '');
    if (!Number.isFinite(bullish) || !Number.isFinite(neutral) || !Number.isFinite(bearish)) {
      continue;
    }
    rows.push({
      weekEnding: mdyShortToWeekEndingIso(month, day, yy),
      bullish,
      neutral,
      bearish,
    });
  }
  if (rows.length === 0) {
    throw new Error('No AAII sentiment rows found in XLS content');
  }
  return rows.slice(-limit).reverse();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJinaPageContent(pageUrl: string, jinaApiKey?: string): Promise<string> {
  const jinaUrl = jinaReaderUrl(pageUrl);
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(JINA_RETRY_DELAY_MS);
    try {
      const res = await fetchWithTimeout(
        jinaUrl,
        { headers: jinaReaderHeaders(jinaApiKey) },
        JINA_TIMEOUT_MS,
      );
      if (res.status === 429) {
        lastErr = new Error(`[aaii-jina] HTTP 429`);
        continue;
      }
      if (!res.ok) throw new Error(`[aaii-jina] HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { content?: string } };
      const content = json?.data?.content ?? '';
      if (!content.trim()) throw new Error('[aaii-jina] Empty page content');
      return content;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0 && lastErr.message.includes('429')) continue;
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('[aaii-jina] Request failed');
}

type AaiiFetchSource = 'aaii.com' | 'aaii.com-sentiment.xls';

async function loadAaiiWeeks(
  weeks: number,
  jinaApiKey?: string,
): Promise<{ parsed: AaiiSentimentWeek[]; source: AaiiFetchSource }> {
  const primaryErrors: string[] = [];

  try {
    const content = await fetchJinaPageContent(AAII_RESULTS_URL, jinaApiKey);
    return {
      parsed: parseAaiiSentimentFromContent(content, weeks),
      source: 'aaii.com',
    };
  } catch (err) {
    primaryErrors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    const content = await fetchJinaPageContent(AAII_XLS_URL, jinaApiKey);
    return {
      parsed: parseAaiiSentimentFromXlsContent(content, weeks),
      source: 'aaii.com-sentiment.xls',
    };
  } catch (err) {
    const fallbackMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[aaii] All sources failed. sent_results: ${primaryErrors.join('; ')}; sentiment.xls: ${fallbackMsg}`,
    );
  }
}

export async function fetchAaiiSentiment(
  weeks: number,
  jinaApiKey?: string,
): Promise<AaiiSentimentResult> {
  const { parsed, source } = await loadAaiiWeeks(weeks, jinaApiKey);
  return {
    source,
    fetchedAt: new Date().toISOString(),
    weeks: parsed,
  };
}
