/**
 * Known limitations:
 * - US early-close days (Thanksgiving eve, Christmas eve) not modeled
 * - TASE Erev Chag early-close not modeled
 * - Nager may not cover all TASE closure days (some Jewish holidays)
 * - After-hours / pre-market sessions not modeled
 */

import { fetchWithTimeout } from '../utils/fetch.js';
import {
  LocalParts,
  MarketConfig,
  MarketKey,
  MarketStatus,
  MarketStatusResponse,
  NagerHoliday,
} from '../types/market.js';

export type { MarketKey, MarketStatus, MarketStatusResponse };

export const MARKET_KEYS: MarketKey[] = ['tase', 'lse', 'nyse', 'six'];

export const MARKETS: Record<MarketKey, MarketConfig> = {
  tase: {
    key: 'tase',
    name: 'Tel Aviv Stock Exchange',
    flag: '🇮🇱',
    timezone: 'Asia/Jerusalem',
    countryCode: 'IL',
    tradingDays: [1, 2, 3, 4, 5],
    openHour: 9,
    openMinute: 59,
    closeHour: 17,
    closeMinute: 25,
    fridayCloseHour: 14,
    fridayCloseMinute: 0,
  },
  lse: {
    key: 'lse',
    name: 'London Stock Exchange',
    flag: '🇬🇧',
    timezone: 'Europe/London',
    countryCode: 'GB',
    tradingDays: [1, 2, 3, 4, 5],
    openHour: 8,
    openMinute: 0,
    closeHour: 16,
    closeMinute: 30,
  },
  nyse: {
    key: 'nyse',
    name: 'New York Stock Exchange',
    flag: '🇺🇸',
    timezone: 'America/New_York',
    countryCode: 'US',
    tradingDays: [1, 2, 3, 4, 5],
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
  },
  six: {
    key: 'six',
    name: 'SIX Swiss Exchange',
    flag: '🇨🇭',
    timezone: 'Europe/Zurich',
    countryCode: 'CH',
    tradingDays: [1, 2, 3, 4, 5],
    openHour: 9,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 30,
  },
};

function getLocalParts(date: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // Intl midnight edge case
  const minute = parseInt(get('minute'), 10);
  return {
    weekday: WEEKDAY_MAP[get('weekday')] ?? 0,
    hour,
    minute,
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

const holidayCache = new Map<string, Set<string>>();

// Exported for test cleanup only
export function clearHolidayCache(): void {
  holidayCache.clear();
}

async function fetchHolidays(year: number, countryCode: string): Promise<Set<string>> {
  const key = `${year}-${countryCode}`;
  const cached = holidayCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetchWithTimeout(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } },
      8_000,
    );
    if (!res.ok) return new Set<string>(); // don't cache failures
    const json: unknown = await res.json();
    const dates = new Set<string>((json as NagerHoliday[]).map((h) => h.date));
    holidayCache.set(key, dates);
    return dates;
  } catch {
    return new Set<string>(); // timeout / network error — degrade gracefully
  }
}

export async function getMarketStatus(market: MarketConfig, now: Date): Promise<MarketStatus> {
  const local = getLocalParts(now, market.timezone);

  if (!market.tradingDays.includes(local.weekday)) {
    return {
      key: market.key,
      name: market.name,
      open: false,
      localTime: local.localTime,
      timezone: market.timezone,
      flag: market.flag,
    };
  }

  const nowMins = local.hour * 60 + local.minute;
  const openMins = market.openHour * 60 + market.openMinute;
  const isFriday = local.weekday === 5;
  const effectiveCloseHour =
    isFriday && market.fridayCloseHour !== undefined ? market.fridayCloseHour : market.closeHour;
  const effectiveCloseMinute =
    isFriday && market.fridayCloseMinute !== undefined
      ? market.fridayCloseMinute
      : market.closeMinute;
  const closeMins = effectiveCloseHour * 60 + effectiveCloseMinute;
  if (nowMins < openMins || nowMins >= closeMins) {
    return {
      key: market.key,
      name: market.name,
      open: false,
      localTime: local.localTime,
      timezone: market.timezone,
      flag: market.flag,
    };
  }

  // Only check holiday when within trading window (avoids unnecessary I/O)
  const dateStr = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  const holidays = await fetchHolidays(local.year, market.countryCode);
  const open = !holidays.has(dateStr);

  return {
    key: market.key,
    name: market.name,
    open,
    localTime: local.localTime,
    timezone: market.timezone,
    flag: market.flag,
  };
}

export async function getAllMarketStatuses(now: Date): Promise<MarketStatusResponse> {
  const results = await Promise.all(
    MARKET_KEYS.map((k): Promise<MarketStatus> => getMarketStatus(MARKETS[k], now)),
  );
  return {
    tase: results[0] as MarketStatus,
    lse: results[1] as MarketStatus,
    nyse: results[2] as MarketStatus,
    six: results[3] as MarketStatus,
    asOf: now.toISOString(),
  };
}
