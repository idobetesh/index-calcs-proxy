export type MarketKey = 'tase' | 'lse' | 'nyse' | 'six';

export interface MarketConfig {
  key: MarketKey;
  name: string;
  flag: string;
  timezone: string; // IANA tz
  countryCode: string; // for Nager holiday API
  tradingDays: number[]; // 0=Sun…6=Sat
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  fridayCloseHour?: number; // if set, overrides closeHour on Fridays
  fridayCloseMinute?: number;
}

export interface MarketStatus {
  key: MarketKey;
  name: string;
  open: boolean;
  localTime: string; // "HH:MM"
  timezone: string;
  flag: string;
}

export interface MarketStatusResponse {
  tase: MarketStatus;
  lse: MarketStatus;
  nyse: MarketStatus;
  six: MarketStatus;
  asOf: string; // ISO timestamp
}

export interface QuoteResult {
  price: number;
  change: number; // % change from previous close
}

export interface NagerHoliday {
  date: string;
}

export interface LocalParts {
  weekday: number;
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
  localTime: string;
}
