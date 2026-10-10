import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeGroupWinRateComparison } from "./historical-independent-trade-statistical-validation-types";

export const HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION =
  "1.0" as const;

export type EvaluatorDiagnosticEvaluationStatus = Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>;

export const EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES: readonly EvaluatorDiagnosticEvaluationStatus[] =
  ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export interface EvaluatorDiagnosticPopulation {
  independentTrades: number;
  decisiveResolutions: number;
  snapshotReference: IndependentTradeSnapshotReference;
}

export interface EvaluatorDiagnosticOutcomeCounts {
  totalTrades: number;
  decisiveTrades: number;
  favorableWins: number;
  adverseLosses: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
}

export interface EvaluatorDiagnosticGroupSummary {
  evaluationStatus: EvaluatorDiagnosticEvaluationStatus;
  counts: EvaluatorDiagnosticOutcomeCounts;
  decisiveWinRate: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  winRateDeltaFromOverall: number | null;
  decisiveShareOfOverall: number | null;
  contributionToDecisiveWins: number | null;
}

export type EvaluatorDiagnosticEvaluationOutcomeCross = {
  [E in EvaluatorDiagnosticEvaluationStatus]: {
    [C in HistoricalPositionPolicyClassification]: number;
  };
};

export interface EvaluatorDiagnosticDimensionSlice {
  evaluationStatus: EvaluatorDiagnosticEvaluationStatus;
  dimensionKey: string;
  totalTrades: number;
  decisiveTrades: number;
  favorableWins: number;
  adverseLosses: number;
  decisiveWinRate: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  winRateDeltaFromOverall: number | null;
}

export interface EvaluatorDiagnosticExitDistributionRow {
  evaluationStatus: EvaluatorDiagnosticEvaluationStatus;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  count: number;
  shareWithinEvaluationGroup: number;
}

export interface EvaluatorDiagnosticDurationSummary {
  evaluationStatus: EvaluatorDiagnosticEvaluationStatus;
  sampleCount: number;
  averageDurationBars: number | null;
  medianDurationBars: number | null;
}

export interface EvaluatorDiagnosticMismatchSummary {
  passedWins: number;
  passedLosses: number;
  failedWins: number;
  failedLosses: number;
  passedDecisive: number;
  failedDecisive: number;
  passedWinRate: number | null;
  failedWinRate: number | null;
  /** FAILED rate minus PASSED rate in percentage points (descriptive). */
  decisiveWinRateDifferencePercentagePoints: number | null;
  passedLossesObservedMismatch: number;
  passedWinsObservedMismatch: number;
  failedWinsObservedMismatch: number;
  failedLossesObservedMismatch: number;
}

export interface EvaluatorDiagnosticDriverNote {
  dimension: string;
  observation: string;
  caution: string;
}

export interface EvaluatorDiagnosticWarnings {
  temporalDependence: string;
  overlappingHistoricalObservations: string;
  sampleSize: string;
  multipleComparisons: string;
  observationalAnalysis: string;
  noPnL: string;
  noFees: string;
  noSlippage: string;
  noExecutionSimulation: string;
  notCausalInference: string;
  notEvaluatorVerdict: string;
}

export interface HistoricalIndependentTradeEvaluatorDiagnosticReport {
  schemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION;
  researchQuestion: string;
  population: EvaluatorDiagnosticPopulation;
  overall: {
    decisiveWinRate: number | null;
    counts: EvaluatorDiagnosticOutcomeCounts;
  };
  evaluation: {
    passed: EvaluatorDiagnosticGroupSummary;
    failed: EvaluatorDiagnosticGroupSummary;
    insufficientContext: EvaluatorDiagnosticGroupSummary;
    evaluationOutcomeCross: EvaluatorDiagnosticEvaluationOutcomeCross;
    passedVsFailedComparison: IndependentTradeGroupWinRateComparison | null;
  };
  byDirection: readonly EvaluatorDiagnosticDimensionSlice[];
  byRrBucket: readonly EvaluatorDiagnosticDimensionSlice[];
  bySetupFamily: readonly EvaluatorDiagnosticDimensionSlice[];
  byExitReason: readonly EvaluatorDiagnosticExitDistributionRow[];
  byDuration: readonly EvaluatorDiagnosticDimensionSlice[];
  durationSummary: readonly EvaluatorDiagnosticDurationSummary[];
  mismatch: EvaluatorDiagnosticMismatchSummary;
  drivers: readonly EvaluatorDiagnosticDriverNote[];
  warnings: EvaluatorDiagnosticWarnings;
}

export interface AnalyzeIndependentTradeEvaluatorDiagnosticInput {
  statisticsReport: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  lifecycleReport?: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  validationReport?: import("./historical-independent-trade-statistical-validation-types").IndependentTradeStatisticalValidationReport;
}
