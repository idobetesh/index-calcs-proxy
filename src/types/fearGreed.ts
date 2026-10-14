export type FearGreedMarket = 'crypto' | 'stocks';

export interface FearGreedResult {
  market: FearGreedMarket;
  value: number; // 0–100
  rating: string; // lowercase label, e.g. "fear", "extreme fear"
  source: string;
  timestamp: string; // ISO-8601 when the index reading applies (or fetch time)
}
