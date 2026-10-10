import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

export const HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION =
  "1.0" as const;

/** Observed production evaluator minimum (unchanged in B-12o). */
export const CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD = 1.5 as const;

export const HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS: readonly number[] =
  [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export type CounterfactualRrThreshold =
  (typeof HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS)[number];

export type CounterfactualEvaluationStatus =
  | "PASSED"
  | "FAILED"
  | "NOT_CLASSIFIABLE";

export type CurrentEvaluationStatus = Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>;

export interface RrCounterfactualOutcomeSnapshot {
  totalTrades: number;
  decisiveTrades: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface RrCounterfactualFrozenTheoreticalRSlice {
  available: boolean;
  rEligibleDecisiveTrades: number;
  decisiveWithoutTheoreticalR: number;
  sumR: number;
  expectancyR: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  profitFactorR: number | null;
  note: string;
}

export interface RrCounterfactualPopulationChange {
  newlyPassedComparedWithCurrent: number;
  newlyFailedComparedWithCurrent: number;
  unchangedPassed: number;
  unchangedFailed: number;
  notClassifiableRr: number;
  insufficientContextExcludedFromTransition: number;
}

export interface RrCounterfactualOutcomeTransitionCell {
  currentEvaluationStatus: CurrentEvaluationStatus;
  policyOutcome: "FAVORABLE_RESOLUTION" | "ADVERSE_RESOLUTION";
  tradeCount: number;
  counterfactualPassed: number;
  counterfactualFailed: number;
  counterfactualNotClassifiable: number;
}

export interface RrCounterfactualCurrentFailedWinAnalysis {
  currentFailedHistoricalWinTrades: number;
  counterfactualPassedAtThreshold: number;
  counterfactualFailedAtThreshold: number;
  counterfactualNotClassifiableAtThreshold: number;
  descriptiveNote: string;
}

export interface RrCounterfactualDimensionSlice {
  dimension: "DIRECTION" | "PROSPECTIVE_RR" | "SETUP_FAMILY" | "DURATION" | "GEOMETRY";
  dimensionValue: string;
  counterfactualPassed: RrCounterfactualOutcomeSnapshot;
  counterfactualFailed: RrCounterfactualOutcomeSnapshot;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface RrCounterfactualThresholdComparison {
  decisiveWinRateDeltaVsReferenceThresholdPercentagePoints: number | null;
  expectancyRDeltaVsReferenceThreshold: number | null;
  referenceThreshold: typeof CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD;
}

export interface RrCounterfactualThresholdRow {
  threshold: number;
  counterfactualPassed: RrCounterfactualOutcomeSnapshot;
  counterfactualFailed: RrCounterfactualOutcomeSnapshot;
  notClassifiable: RrCounterfactualOutcomeSnapshot;
  theoreticalR: {
    passed: RrCounterfactualFrozenTheoreticalRSlice;
    failed: RrCounterfactualFrozenTheoreticalRSlice;
    combined: RrCounterfactualFrozenTheoreticalRSlice;
  };
  populationChanges: RrCounterfactualPopulationChange;
  outcomeTransitions: readonly RrCounterfactualOutcomeTransitionCell[];
  currentFailedHistoricalWin: RrCounterfactualCurrentFailedWinAnalysis;
  dimensionSlices: readonly RrCounterfactualDimensionSlice[];
  comparisonToReferenceThreshold: RrCounterfactualThresholdComparison;
}

export interface RrCounterfactualSummaryTableRow {
  threshold: number;
  passTrades: number;
  failTrades: number;
  passWinRateDecisive: number | null;
  failWinRateDecisive: number | null;
  decisiveTrades: number;
  expectancyR: number | null;
  profitFactorR: number | null;
}

export interface HistoricalEvaluatorRrThresholdCounterfactualReport {
  schemaVersion: typeof HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_RR_THRESHOLD_COUNTERFACTUAL";
  canonicalFields: {
    prospectiveRr: "IndependentTradeUnit.canonicalRrRatio";
    currentEvaluationStatus: "IndependentTradeUnit.tradeEvaluationStatus";
    theoreticalR: "B-12h eligibilityAudit.decisiveRows[].theoreticalR (frozen)";
  };
  semantics: {
    counterfactualRule: string;
    notClassifiable: string;
    evaluatorUnchanged: string;
  };
  referenceEvaluatorThreshold: typeof CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD;
  population: {
    independentTrades: number;
    measurableForCounterfactual: number;
  };
  thresholds: readonly RrCounterfactualThresholdRow[];
  summaryTable: readonly RrCounterfactualSummaryTableRow[];
  warnings: readonly string[];
}

export interface BuildHistoricalEvaluatorRrThresholdCounterfactualInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  /** Frozen per-trade theoretical R (B-12h); required for theoretical R slices. */
  eligibilityAuditReport?: import("./historical-independent-trade-r-eligibility-audit-types").HistoricalIndependentTradeREligibilityAuditReport;
  /** Reference only for parity notes; not rebuilt. */
  rMultipleStatisticsReport?: import("./historical-independent-trade-r-multiple-statistics-types").HistoricalIndependentTradeRMultipleStatisticsReport;
  statisticsReport?: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
}
