export interface AaiiSentimentWeek {
  weekEnding: string;
  bullish: number;
  neutral: number;
  bearish: number;
}

export interface AaiiSentimentResult {
  source: string;
  fetchedAt: string;
  weeks: AaiiSentimentWeek[];
}
