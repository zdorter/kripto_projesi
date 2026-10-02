import type { TRADE_EVALUATION_SCHEMA_VERSION } from "./trade-evaluation-contract";

export type TradeEvaluationStatus = "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT";

export type TradeEvaluationCheckOutcome =
  | "VALID"
  | "STALE"
  | "INVALID"
  | "INSUFFICIENT_CONTEXT";

export type TradeEvaluationSetupValidity =
  | "VALID"
  | "INVALID"
  | "INSUFFICIENT_CONTEXT";

export type TradeEvaluationFirstFailureCode =
  | "ENTRY_INSUFFICIENT_CONTEXT"
  | "ENTRY_STALE"
  | "STOP_INSUFFICIENT_CONTEXT"
  | "STOP_INVALID"
  | "TARGET_INSUFFICIENT_CONTEXT"
  | "TARGET_INVALID"
  | "RR_INSUFFICIENT_CONTEXT"
  | "RR_BELOW_MINIMUM"
  | "SETUP_INSUFFICIENT_CONTEXT"
  | "SETUP_INVALIDATED"
  | null;

export interface TradeEvaluationChecks {
  entry: TradeEvaluationCheckOutcome;
  stop: TradeEvaluationCheckOutcome;
  target: TradeEvaluationCheckOutcome;
  rr: TradeEvaluationCheckOutcome;
  setupValidity: TradeEvaluationSetupValidity;
}

export interface TradeEvaluationDiagnostics {
  entryReferencePrice: number | null;
  liveMarketPrice: number | null;
  entryDeviationRatio: number | null;
  entryDeviationPercent: number | null;
  risk: number | null;
  reward: number | null;
  rrRatio: number | null;
  minimumRr: number;
  entryFreshnessTolerance: number;
  direction: "BULLISH" | "BEARISH" | "UNRESOLVED" | null;
  structuralInvalidationReferencePrice: number | null;
}

export interface TradeEvaluationResult {
  schemaVersion: typeof TRADE_EVALUATION_SCHEMA_VERSION;
  status: TradeEvaluationStatus;
  passed: boolean;
  checks: TradeEvaluationChecks;
  firstFailure: TradeEvaluationFirstFailureCode;
  diagnostics: TradeEvaluationDiagnostics;
  evaluationBarIndex: number | null;
  evaluationPrice: number | null;
  futureSafe: boolean;
}

export interface TradeEvaluationInput {
  direction: "BULLISH" | "BEARISH" | "UNRESOLVED" | null;
  entryReferencePrice: number | null;
  /** Live ticker — entry freshness and setup validity (not structural candle analysis). */
  liveMarketPrice: number | null;
  stopReferencePrice: number | null;
  targetReferencePrice: number | null;
  /** Scenario structural invalidation level (resolveProspectiveStructuralInvalidation). */
  structuralInvalidationReferencePrice: number | null;
  setupLifecycleStatus: "CANDIDATE" | "CONFIRMED" | "INVALID" | "INSUFFICIENT_CONTEXT" | null;
  structuralInvalidationTriggered: boolean;
  evaluationBarIndex: number | null;
  evaluationPrice: number | null;
  futureSafe: boolean;
}
