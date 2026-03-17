export interface EtfQuote {
  id: string;
  name: string;
  price: number;
  currency: 'ILA'; // אגורות (agurot) — 1/100 of ILS
  date: string;
  source: string;
}

export interface MayaFundResponse {
  fundId?: number;
  name?: string;
  purchasePrice?: number;
  redemptionPrice?: number;
  ratesAsOf?: string;
}

export interface TaseInDayResponse {
  baseInfo?: { brte?: number; dte?: string };
  inDay?: Array<{ pval?: number }>;
}

export interface JinaSource {
  name: string;
  url: (id: string) => string;
  /** Extract price from Jina-rendered markdown. Return null if not found. */
  parse: (content: string) => number | null;
}
