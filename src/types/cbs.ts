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

export interface DataSource {
  label: string;
  url: string;
}
