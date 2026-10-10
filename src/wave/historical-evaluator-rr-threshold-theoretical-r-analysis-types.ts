import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";

export const HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD = 1.5 as const;

export type RrThresholdTheoreticalRProspectiveBandId =
  | "RR_LT_1_0"
  | "RR_1_0_TO_1_5"
  | "RR_GTE_1_5";

export interface RrThresholdTheoreticalRGroupMetrics {
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
  notClassifiableProspectiveRr: number;
  decisiveWinRate: HistoricalPositionOutcomeStatisticRate;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  theoreticalREligibleDecisive: number;
  theoreticalRUnavailableDecisive: number;
  expectancyDenominatorId: "THEORETICAL_R_ELIGIBLE_DECISIVE";
  sumR: number;
  expectancyR: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  profitFactorR: number | null;
  frozenTheoreticalRNote: string;
}

export interface RrThresholdTheoreticalRThresholdSlice {
  threshold: number;
  counterfactualPassed: RrThresholdTheoreticalRGroupMetrics;
  counterfactualFailed: RrThresholdTheoreticalRGroupMetrics;
  notClassifiable: RrThresholdTheoreticalRGroupMetrics;
}

export interface RrThresholdTheoreticalRPassComparisonRow {
  threshold: number;
  passTrades: number;
  passDecisive: number;
  passWins: number;
  passLosses: number;
  passWinRate: number | null;
  passSumR: number;
  passExpectancyR: number | null;
  passProfitFactorR: number | null;
}

export interface RrThresholdTheoreticalRFailComparisonRow {
  threshold: number;
  failTrades: number;
  failDecisive: number;
  failWins: number;
  failLosses: number;
  failWinRate: number | null;
  failSumR: number;
  failExpectancyR: number | null;
  failProfitFactorR: number | null;
}

export interface RrThresholdCurrentFailedTargetTouchedRow {
  threshold: number;
  currentFailedTargetTouchedTrades: number;
  counterfactualPassed: number;
  counterfactualFailed: number;
  counterfactualNotClassifiable: number;
}

export interface RrThresholdProspectiveRrBucketRow {
  prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
  metrics: RrThresholdTheoreticalRGroupMetrics;
}

export interface RrThresholdBaselineDeltaRow {
  threshold: number;
  deltaPassPopulation: number;
  deltaPassWinRatePercentagePoints: number | null;
  deltaPassExpectancyR: number | null;
  deltaPassProfitFactorR: number | null;
  deltaFailWinRatePercentagePoints: number | null;
  deltaFailExpectancyR: number | null;
  deltaFailProfitFactorR: number | null;
}

export interface RrThresholdProspectiveBandComparisonRow {
  bandId: RrThresholdTheoreticalRProspectiveBandId;
  label: string;
  metrics: RrThresholdTheoreticalRGroupMetrics;
}

export interface HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport {
  schemaVersion: typeof HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_RR_THRESHOLD_THEORETICAL_R";
  terminology: {
    prospectiveRr: "IndependentTradeUnit.canonicalRrRatio (counterfactual classification)";
    theoreticalR: "B-12h eligibilityAudit.decisiveRows[].theoreticalR (frozen)";
    counterfactualClassification: "canonicalRrRatio >= threshold => PASS (observational)";
  };
  baselineThreshold: typeof RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD;
  population: {
    independentTrades: number;
    frozenTheoreticalRRows: number;
  };
  thresholdSlices: readonly RrThresholdTheoreticalRThresholdSlice[];
  passComparisonTable: readonly RrThresholdTheoreticalRPassComparisonRow[];
  failComparisonTable: readonly RrThresholdTheoreticalRFailComparisonRow[];
  currentFailedTargetTouched: readonly RrThresholdCurrentFailedTargetTouchedRow[];
  prospectiveRrBucketAnalysis: readonly RrThresholdProspectiveRrBucketRow[];
  prospectiveBandComparison: readonly RrThresholdProspectiveBandComparisonRow[];
  baselineDeltas: readonly RrThresholdBaselineDeltaRow[];
  diagnosticSummary: readonly string[];
  warnings: readonly string[];
}

export interface BuildHistoricalEvaluatorRrThresholdTheoreticalRAnalysisInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  eligibilityAuditReport: import("./historical-independent-trade-r-eligibility-audit-types").HistoricalIndependentTradeREligibilityAuditReport;
  /** Optional B-12o report reference (not rebuilt when omitted). */
  counterfactualReport?: import("./historical-evaluator-rr-threshold-counterfactual-types").HistoricalEvaluatorRrThresholdCounterfactualReport;
}
