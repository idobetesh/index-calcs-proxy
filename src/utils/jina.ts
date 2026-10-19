import { fetchWithTimeout } from './fetch.js';

const DEFAULT_JINA_UA = 'curl/8.0';

export function jinaReaderUrl(targetUrl: string): string {
  return `https://r.jina.ai/${targetUrl}`;
}

export function jinaReaderHeaders(jinaApiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': DEFAULT_JINA_UA,
  };
  const key = jinaApiKey?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export interface JinaReaderPage {
  content: string;
  title?: string;
}

export type JinaReaderFetchOptions = {
  jinaApiKey?: string;
  timeoutMs?: number;
};

/** Build options safe for `exactOptionalPropertyTypes` (omit key when undefined). */
export function jinaReaderFetchOptions(
  jinaApiKey?: string,
  timeoutMs?: number,
): JinaReaderFetchOptions | undefined {
  const opts: JinaReaderFetchOptions = {};
  if (jinaApiKey !== undefined) opts.jinaApiKey = jinaApiKey;
  if (timeoutMs !== undefined) opts.timeoutMs = timeoutMs;
  return Object.keys(opts).length > 0 ? opts : undefined;
}

/** Fetch Jina Reader JSON for a target URL (page URL, not r.jina.ai prefix). */
export async function fetchJinaReaderPage(
  targetUrl: string,
  options?: JinaReaderFetchOptions,
): Promise<JinaReaderPage> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const jinaApiKey = options?.jinaApiKey;
  const res = await fetchWithTimeout(
    jinaReaderUrl(targetUrl),
    { headers: jinaReaderHeaders(jinaApiKey) },
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`[jina] HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: { content?: string; title?: string } };
  const page: JinaReaderPage = { content: json?.data?.content ?? '' };
  const title = json?.data?.title;
  if (title !== undefined) page.title = title;
  return page;
}
