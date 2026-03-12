import { IndexType } from './cbs.js';

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
