import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type {
  EvaluatorFailureReasonAnalysisBucket,
  HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
} from "./historical-evaluator-failure-reason-contract";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

export const EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS = {
  FILTERED_TRADES: "FILTERED_TRADES",
  FAILED_TRADES: "FAILED_TRADES",
  FAILED_DECISIVE_TRADES: "FAILED_DECISIVE_TRADES",
  PASSED_TRADES: "PASSED_TRADES",
  PASSED_DECISIVE_TRADES: "PASSED_DECISIVE_TRADES",
  PASSED_DECISIVE_RESOLUTIONS: "PASSED_DECISIVE_RESOLUTIONS",
  FAILED_DECISIVE_RESOLUTIONS: "FAILED_DECISIVE_RESOLUTIONS",
} as const;

export type EvaluatorFailureReasonDenominatorId =
  (typeof EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS)[keyof typeof EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS];

export interface EvaluatorFailureReasonOutcomeCounts {
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
}

export interface EvaluatorFailureReasonOverallSlice {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  totalTrades: number;
  decisiveTrades: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasuredTrades: number;
  decisiveWinRate: HistoricalPositionOutcomeStatisticRate;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface EvaluatorFailureReasonOutcomeCross {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  byOutcome: EvaluatorFailureReasonOutcomeCounts & {
    decisive: number;
  };
}

export interface EvaluatorFailureReasonFailedSlice {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  failedTrades: number;
  failedDecisive: number;
  failedWins: number;
  failedLosses: number;
  failedWinRateDecisive: HistoricalPositionOutcomeStatisticRate;
  failedWinsContributionToAllFailedWins: number | null;
  failedWinsContributionToAllDecisiveWins: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface EvaluatorFailureReasonPassedSummary {
  passedTrades: number;
  passedDecisive: number;
  passedWins: number;
  passedLosses: number;
  passedWinRateDecisive: HistoricalPositionOutcomeStatisticRate;
  denominatorId: typeof EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS.PASSED_DECISIVE_RESOLUTIONS;
}

export interface EvaluatorFailureReasonUnknownPopulation {
  failedWithMissingFailureReason: number;
  insufficientContextNoFailureReason: number;
  notes: string;
}

export interface EvaluatorFailureReasonDimensionRow<TKey extends string> {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  dimensionKey: TKey;
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
}

export interface HistoricalEvaluatorFailureReasonAnalysisReport {
  schemaVersion: typeof HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_EVALUATOR_FAILURE_REASON";
  canonicalSource: {
    artifactPath: string;
    lifecycleField: string;
    freezeNote: string;
  };
  population: {
    independentTrades: number;
    snapshotReference: IndependentTradeSnapshotReference | null;
    reconciliationNote: string;
  };
  parity: {
    lifecycleWins: number;
    lifecycleLosses: number;
    lifecycleDecisive: number;
    statisticsWins: number | null;
    statisticsLosses: number | null;
    statisticsDecisive: number | null;
    parityHolds: boolean;
  };
  overallByFailureReason: readonly EvaluatorFailureReasonOverallSlice[];
  failedTradeOutcomeAnalysis: readonly EvaluatorFailureReasonFailedSlice[];
  passedTradeOutcomeAnalysis: EvaluatorFailureReasonPassedSummary;
  failureReasonByOutcome: readonly EvaluatorFailureReasonOutcomeCross[];
  byDirection: readonly EvaluatorFailureReasonDimensionRow<HistoricalPositionOutcomeDirectionSliceKey>[];
  byRrBucket: readonly EvaluatorFailureReasonDimensionRow<HistoricalMeasurementRRBucketRow>[];
  bySetupFamily: readonly EvaluatorFailureReasonDimensionRow<string>[];
  byGeometry: readonly EvaluatorFailureReasonDimensionRow<EntryReferenceGeometryQuality>[];
  byExitReason: readonly EvaluatorFailureReasonDimensionRow<ProspectiveSetupOutcomeReplayStatus>[];
  byDuration: readonly EvaluatorFailureReasonDimensionRow<IndependentTradeDurationBucketId>[];
  unknownPopulation: EvaluatorFailureReasonUnknownPopulation;
  warnings: readonly string[];
}

export interface BuildHistoricalEvaluatorFailureReasonAnalysisInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  statisticsReport?: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  evaluatorDiagnosticReport?: import("./historical-independent-trade-evaluator-diagnostic-types").HistoricalIndependentTradeEvaluatorDiagnosticReport;
}
