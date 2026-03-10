export interface Env {
  SECRET_KEY: string;
  ENVIRONMENT: string;
}

export type IndexType = 'cpi' | 'construction' | 'housing';

export const INDEX_IDS: Record<IndexType, number> = {
  cpi: 120010,
  construction: 120350,
  housing: 40010,
};

export interface CbsIndexEntry {
  period: string; // "YYYY-MM"
  value: number;
  monthlyPercent: number; // month-over-month % change
}

export interface CbsApiDateEntry {
  year: number;
  month: number;
  percent: number; // month-over-month % change
  currBase: {
    value: number;
  };
}

export interface CbsApiResponse {
  month: Array<{
    code: number;
    date: CbsApiDateEntry[];
  }>;
}

export interface CalcParams {
  amount: number;
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  index: IndexType;
  format: 'text' | 'json';
}

export interface CalcResult {
  fromPeriod: string;
  toPeriod: string;
  fromValue: number;
  toValue: number;
  originalAmount: number;
  indexedAmount: number;
  difference: number;
  percentage: number;
  formatted: string;
}
