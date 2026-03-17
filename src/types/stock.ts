export interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  exchange: string;
  date: string;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

/** Yahoo Finance /v8/finance/chart meta shape */
export interface YahooChartMeta {
  symbol?: string;
  shortName?: string;
  regularMarketPrice?: number;
  currency?: string;
  fullExchangeName?: string;
  regularMarketTime?: number;
}

/** Yahoo Finance /v8/finance/quote result shape (kept for reference) */
export interface YahooQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  currency?: string;
  fullExchangeName?: string;
  regularMarketTime?: number;
}

/** Yahoo Finance /v1/finance/search quote shape */
export interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  quoteType?: string;
}
