import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";

export const HISTORICAL_INDEPENDENT_TRADE_STATISTICAL_VALIDATION_SCHEMA_VERSION =
  "1.0" as const;

export const INDEPENDENT_TRADE_CONFIDENCE_LEVELS = [0.9, 0.95, 0.99] as const;

export type IndependentTradeConfidenceLevel =
  (typeof INDEPENDENT_TRADE_CONFIDENCE_LEVELS)[number];

export const INDEPENDENT_TRADE_DEFAULT_BASELINE_WIN_RATE = 0.5 as const;

export const INDEPENDENT_TRADE_DEFAULT_ALPHA = 0.05 as const;

export const INDEPENDENT_TRADE_DEFAULT_CONFIDENCE_LEVEL = 0.95 as const;

export type IndependentTradeConfidenceIntervalMethod =
  "WILSON_SCORE_INTERVAL";

export interface IndependentTradeWinRateConfidenceInterval {
  numerator: number;
  denominator: number;
  value: number | null;
  confidenceLevel: IndependentTradeConfidenceLevel;
  lower: number | null;
  upper: number | null;
  method: IndependentTradeConfidenceIntervalMethod;
}

export type IndependentTradeBaselineTestType =
  "EXACT_BINOMIAL_TWO_SIDED";

export interface IndependentTradeBaselineWinRateTest {
  numerator: number;
  denominator: number;
  observedRate: number | null;
  baselineRate: number;
  pValue: number | null;
  testType: IndependentTradeBaselineTestType;
  significantAt95: boolean;
  alpha: number;
}

export type IndependentTradeGroupComparisonMethod =
  "TWO_PROPORTION_Z_TEST_TWO_SIDED";

export interface IndependentTradeGroupWinRateComparison {
  groupA: { wins: number; losses: number; rate: number | null };
  groupB: { wins: number; losses: number; rate: number | null };
  difference: number | null;
  pValue: number | null;
  significantAt95: boolean;
  alpha: number;
  method: IndependentTradeGroupComparisonMethod;
  evidenceLabel:
    | "EVIDENCE_OF_DIFFERENCE"
    | "NO_STATISTICAL_EVIDENCE_OF_DIFFERENCE"
    | "INSUFFICIENT_DECISIVE_SAMPLE";
}

export type IndependentTradeStatisticalEvidenceLabel =
  | "SIGNIFICANT_AT_ALPHA"
  | "NOT_SIGNIFICANT_AT_ALPHA"
  | "INSUFFICIENT_SAMPLE";

export interface IndependentTradeStatisticalValidationConfiguration {
  validationSchemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_STATISTICAL_VALIDATION_SCHEMA_VERSION;
  confidenceLevel: IndependentTradeConfidenceLevel;
  baselineRate: number;
  alpha: number;
  policyId: HistoricalPositionOutcomePolicyId;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
}

export interface IndependentTradeValidatedSlice {
  sampleSize: number;
  wins: number;
  losses: number;
  decisiveResolutions: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  observedRate: number | null;
  confidenceInterval: IndependentTradeWinRateConfidenceInterval;
  winRateDeltaFromBaseline: number | null;
  winRateDeltaFromOverall: number | null;
  baselineTest: IndependentTradeBaselineWinRateTest;
}

export interface IndependentTradeStatisticalWarnings {
  multipleComparisons: {
    testsPerformed: number;
    warning: boolean;
    message: string;
  };
  temporalDependence: {
    warning: boolean;
    message: string;
  };
  baselineNotProfitability: {
    message: string;
  };
  notTradingRecommendation: {
    message: string;
  };
}

export interface IndependentTradeStatisticalValidationReport {
  configuration: IndependentTradeStatisticalValidationConfiguration;
  snapshotReference: IndependentTradeSnapshotReference;
  overall: IndependentTradeValidatedSlice;
  baselineTest: IndependentTradeBaselineWinRateTest;
  overallConfidenceInterval: IndependentTradeWinRateConfidenceInterval;
  byDirection: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    IndependentTradeValidatedSlice
  >;
  byRrBucket: Record<
    HistoricalMeasurementRRBucketRow,
    IndependentTradeValidatedSlice
  >;
  bySetupFamily: Record<string, IndependentTradeValidatedSlice>;
  byEvaluation: Record<TradeEvaluationStatus, IndependentTradeValidatedSlice>;
  byCohort: Record<HistoricalMeasurementCohort, IndependentTradeValidatedSlice>;
  byExitReason: Record<
    ProspectiveSetupOutcomeReplayStatus,
    IndependentTradeValidatedSlice
  >;
  byDuration: Record<
    IndependentTradeDurationBucketId,
    IndependentTradeValidatedSlice
  >;
  evaluationComparison: {
    passedVsFailed: IndependentTradeGroupWinRateComparison;
  };
  warnings: IndependentTradeStatisticalWarnings;
}

export interface ValidateIndependentTradeStatisticsInput {
  statisticsReport: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  analysisReport?: import("./historical-independent-trade-analysis-types").IndependentTradeAnalysisReport;
  confidenceLevel?: IndependentTradeConfidenceLevel;
  baselineRate?: number;
  alpha?: number;
}
