import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticsSlice } from "./historical-independent-trade-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeDurationStatistics } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeEvaluationPolicyMatrix } from "./historical-independent-trade-statistics-types";

export const HISTORICAL_INDEPENDENT_TRADE_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const INDEPENDENT_TRADE_SAMPLE_SIZE_CONTRACT_VERSION = "1.0" as const;

/**
 * Versioned decisive-resolution sample bands (B-12d). Slices are never dropped.
 */
export const INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS = {
  verySmallMaxExclusive: 10,
  smallMin: 10,
  smallMaxExclusive: 30,
  moderateMin: 30,
  moderateMaxExclusive: 100,
  largeMin: 100,
  actionableDecisiveMin: 30,
} as const;

export type IndependentTradeSampleSizeQuality =
  | "VERY_SMALL_SAMPLE"
  | "SMALL_SAMPLE"
  | "MODERATE_SAMPLE"
  | "LARGE_SAMPLE";

export interface IndependentTradeAnalysisConfiguration {
  analysisSchemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_ANALYSIS_SCHEMA_VERSION;
  sampleSizeContractVersion: typeof INDEPENDENT_TRADE_SAMPLE_SIZE_CONTRACT_VERSION;
  statisticsSchemaVersion: string;
  policyId: HistoricalPositionOutcomePolicyId;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
  populationKind: "INDEPENDENT_TRADE_ANALYSIS";
}

export interface IndependentTradeAnalysisMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  decisiveResolutions: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  /** Minimum observation threshold (decisive >= 30); not a profitability claim. */
  isActionable: boolean;
  /** Slice win rate minus overall decisive win rate (descriptive; not significance). */
  winRateDeltaFromOverall: number | null;
  /** Share of all decisive resolutions in this slice. */
  decisiveShareOfOverall: number | null;
  /** Share of all decisive wins contributed by this slice. */
  contributionToDecisiveWins: number | null;
}

export interface IndependentTradeExitReasonAnalysisRow {
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  count: number;
  percentageOfTrades: number;
}

export const INDEPENDENT_TRADE_DURATION_BUCKET_IDS = [
  "DURATION_1_3",
  "DURATION_4_6",
  "DURATION_7_12",
  "DURATION_13_24",
] as const;

export type IndependentTradeDurationBucketId =
  (typeof INDEPENDENT_TRADE_DURATION_BUCKET_IDS)[number];

export type IndependentTradeDurationBucketStatisticsMap = {
  [K in IndependentTradeDurationBucketId]: IndependentTradeAnalysisMetrics;
};

export type IndependentTradeDirectionAnalysisMap = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: IndependentTradeAnalysisMetrics;
};

export type IndependentTradeRrBucketAnalysisMap = {
  [K in HistoricalMeasurementRRBucketRow]: IndependentTradeAnalysisMetrics;
};

export type IndependentTradeCohortAnalysisMap = {
  [K in HistoricalMeasurementCohort]: IndependentTradeAnalysisMetrics;
};

export type IndependentTradeEvaluationAnalysisMap = {
  [K in TradeEvaluationStatus]: IndependentTradeAnalysisMetrics;
};

export interface IndependentTradeEvaluationOutcomeCrossCell {
  evaluationStatus: TradeEvaluationStatus;
  policyClassification: HistoricalPositionPolicyClassification;
  count: number;
}

export interface IndependentTradeHighestObservedWinRate {
  dimension: string;
  key: string;
  winRate_decisive: number | null;
  decisiveResolutions: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  note: string;
}

export interface IndependentTradeCombinedAnalysis {
  directionByRrBucket: Record<string, IndependentTradeAnalysisMetrics>;
  directionBySetupFamily: Record<string, IndependentTradeAnalysisMetrics>;
  rrBucketBySetupFamily: Record<string, IndependentTradeAnalysisMetrics>;
  evaluationByDirection: Record<string, IndependentTradeAnalysisMetrics>;
}

export interface IndependentTradeAnalysisPopulationSummary {
  analysisKind: "INDEPENDENT_TRADE";
  snapshotReference: IndependentTradeSnapshotReference;
  wins: number;
  losses: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
  decisiveResolutions: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
}

export interface IndependentTradeAnalysisReport {
  configuration: IndependentTradeAnalysisConfiguration;
  population: IndependentTradeAnalysisPopulationSummary;
  overall: IndependentTradeAnalysisMetrics;
  byDirection: IndependentTradeDirectionAnalysisMap;
  byRrBucket: IndependentTradeRrBucketAnalysisMap;
  bySetupFamily: Record<string, IndependentTradeAnalysisMetrics>;
  bySymbol: Record<string, IndependentTradeAnalysisMetrics>;
  byTimeframe: Record<string, IndependentTradeAnalysisMetrics>;
  byCohort: IndependentTradeCohortAnalysisMap;
  byEvaluation: IndependentTradeEvaluationAnalysisMap;
  evaluationCross: IndependentTradeEvaluationPolicyMatrix;
  evaluationOutcomeCross: readonly IndependentTradeEvaluationOutcomeCrossCell[];
  byExitReason: readonly IndependentTradeExitReasonAnalysisRow[];
  durationSummary: IndependentTradeDurationStatistics;
  byDurationBucket: IndependentTradeDurationBucketStatisticsMap;
  combined: IndependentTradeCombinedAnalysis;
  highestObservedWinRates: readonly IndependentTradeHighestObservedWinRate[];
  descriptiveNotes: readonly string[];
}

import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";

export interface AnalyzeIndependentTradeStatisticsInput {
  statisticsReport: IndependentTradeStatisticsReport;
  /** Required for duration buckets and combined cross-dimensions. */
  lifecycleReport?: IndependentTradeLifecycleReport;
}
