/** Annual fees from Maya (percent, e.g. 0.25 = 0.25% דמי ניהול). */
export interface ManagementFeeResult {
  id: string;
  name: string;
  managementFee: number;
  trusteeFee: number | null;
  variableFee: number | null;
  saleLoad: number | null;
  managerName: string;
  fundType: string;
  source: string;
}
