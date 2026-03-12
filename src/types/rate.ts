export interface RateResult {
  rate: number; // percent, e.g. 4.0
  effectiveDate: string; // "YYYY-MM-DD"
  asOf: string; // ISO timestamp
}

// BOI SDMX v2 response shape (relevant fields only)
export interface BoiSdmxObservations {
  [obsIndex: string]: [string, number]; // ["4", 0] — value string + status code
}

export interface BoiSdmxSeries {
  [seriesKey: string]: { observations: BoiSdmxObservations };
}

export interface BoiSdmxDimensionValue {
  id: string;
  name: string;
}

export interface BoiSdmxResponse {
  data: {
    dataSets: Array<{ series: BoiSdmxSeries }>;
    structure: {
      dimensions: {
        observation: Array<{ id: string; values: BoiSdmxDimensionValue[] }>;
      };
    };
  };
}
