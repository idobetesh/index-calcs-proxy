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
