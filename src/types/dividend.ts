export interface DividendResult {
  id: string;
  currency: string;
  /** Per-share amount (next payment if known, else last / projected). */
  amount: number;
  /** Next ex-dividend or payment date (ISO YYYY-MM-DD). */
  nextDate: string;
  lastAmount: number | null;
  lastDate: string | null;
  /** True when nextDate is projected from history, not announced. */
  isEstimate: boolean;
  source: string;
}
