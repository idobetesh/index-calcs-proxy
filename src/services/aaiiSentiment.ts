import { AaiiSentimentResult, AaiiSentimentWeek } from '../types/aaiiSentiment.js';
import { fetchWithTimeout } from '../utils/fetch.js';

const JINA_TIMEOUT_MS = 25_000;
const AAII_RESULTS_URL = 'https://www.aaii.com/sentimentsurvey/sent_results';

const ROW_RE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+([\d.]+)%([\d.]+)%([\d.]+)%/gm;

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

async function fetchAaiiResultsContent(): Promise<string> {
  const res = await fetchWithTimeout(
    `https://r.jina.ai/${AAII_RESULTS_URL}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
    JINA_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`[aaii-jina] HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { content?: string } };
  const content = json?.data?.content ?? '';
  if (!content.trim()) throw new Error('[aaii-jina] Empty page content');
  return content;
}

export async function fetchAaiiSentiment(weeks: number): Promise<AaiiSentimentResult> {
  const content = await fetchAaiiResultsContent();
  const parsed = parseAaiiSentimentFromContent(content, weeks);
  return {
    source: 'aaii.com',
    fetchedAt: new Date().toISOString(),
    weeks: parsed,
  };
}
