export const CRYPTO_DASHBOARD_ALERTS_KEY = "crypto-dashboard-alerts-v1";

export type DashboardPriceConditionOperator = ">" | "<";

export type DashboardAlertConditionType = "price" | "rsi" | "funding" | "oi_spike";

export interface DashboardPriceCondition {
  type: "price";
  operator: DashboardPriceConditionOperator;
  value: number;
}

export type DashboardAlertCondition = DashboardPriceCondition | {
  type: Exclude<DashboardAlertConditionType, "price">;
  operator: DashboardPriceConditionOperator;
  value: number;
};

export type WaveScannerReferenceType =
  | "ENTRY_REFERENCE"
  | "STRUCTURAL_INVALIDATION_REFERENCE"
  | "TARGET_REFERENCE";

export type WaveScannerAlarmSourceMode = "DEMO" | "LIVE";

export interface WaveScannerAlarmProvenance {
  source: "WAVE_SCANNER";
  sourceMode: WaveScannerAlarmSourceMode;
  symbol: string;
  timeframe: string;
  referenceType: WaveScannerReferenceType;
  referencePrice: number;
  setupFamily: string | null;
  prospectiveCandidateId: string | null;
  evaluationBarTime: number | null;
  targetPolicy: string | null;
  snapshotPrice: number;
  duplicateKey: string;
}

export interface DashboardAlert {
  id: string;
  name: string;
  symbol: string;
  enabled: boolean;
  logic: "AND" | "OR";
  conditions: DashboardAlertCondition[];
  _wasTrue?: boolean;
  waveScanner?: WaveScannerAlarmProvenance;
}

export interface DashboardAlertsStore {
  alerts: DashboardAlert[];
  history: Array<{
    time: string;
    alertName: string;
    desc: string;
    symbol: string | null;
    interval: string | null;
  }>;
}

export function emptyAlertsStore(): DashboardAlertsStore {
  return { alerts: [], history: [] };
}
