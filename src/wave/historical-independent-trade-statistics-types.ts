import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type {
  HistoricalPositionOutcomePolicyDenominatorId,
  HistoricalPositionOutcomePolicyId,
  HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { IndependentTradeLifecycleSummary } from "./independent-trade-unit-lifecycle-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";

export const HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

/**
 * B-12c trade population counts (not B-11 snapshot counts).
 * Invariant: classification buckets sum to totalTradeObservations.
 */
export interface IndependentTradeStatisticsCounts {
  totalTrades: number;
  measuredTrades: number;
  unmeasuredTrades: number;
  favorableResolutions: number;
  adverseResolutions: number;
  wins: number;
  losses: number;
  decisiveResolutions: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
  measuredNonDecisive: number;
  totalTradeObservations: number;
}

/** B-10c denominator semantics on trade population. */
export interface IndependentTradeDenominators {
  filteredTrades: number;
  measuredTrades: number;
  unmeasuredTrades: number;
  decisiveResolutions: number;
  measuredNonDecisive: number;
}

export interface IndependentTradeStatisticsRates {
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
}

export type IndependentTradeClassificationDistribution = {
  [K in HistoricalPositionPolicyClassification]: number;
};

export type IndependentTradePathOutcomeDistribution = {
  [K in ProspectiveSetupOutcomeReplayStatus]: number;
};

export const INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS: readonly TradeEvaluationStatus[] =
  ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export type IndependentTradeEvaluationPolicyMatrix = {
  [E in TradeEvaluationStatus]: {
    [C in HistoricalPositionPolicyClassification]: number;
  };
};

export interface IndependentTradeDurationStatistics {
  /** Measured trades with finite lifecycleDurationBars only. */
  sampleCount: number;
  minDurationBars: number | null;
  maxDurationBars: number | null;
  averageDurationBars: number | null;
  medianDurationBars: number | null;
}

export interface IndependentTradeStatisticsSlice {
  counts: IndependentTradeStatisticsCounts;
  denominators: IndependentTradeDenominators;
  classification: IndependentTradeClassificationDistribution;
  rates: IndependentTradeStatisticsRates;
}

export type IndependentTradeCohortStatisticsMap = {
  [K in HistoricalMeasurementCohort]: IndependentTradeStatisticsSlice;
};

export type IndependentTradeSymbolStatisticsMap = Record<
  string,
  IndependentTradeStatisticsSlice
>;

export type IndependentTradeTimeframeStatisticsMap = Record<
  string,
  IndependentTradeStatisticsSlice
>;

export type IndependentTradeSetupFamilyStatisticsMap = Record<
  string,
  IndependentTradeStatisticsSlice
>;

export type IndependentTradeDirectionStatisticsMap = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: IndependentTradeStatisticsSlice;
};

export type IndependentTradeRrBucketStatisticsMap = {
  [K in HistoricalMeasurementRRBucketRow]: IndependentTradeStatisticsSlice;
};

/** B-11 snapshot funnel reference (not mixed into trade win rate). */
export interface IndependentTradeSnapshotReference {
  totalSnapshots: number;
  eligibleEntrySnapshots: number;
  independentTrades: number;
  measuredTrades: number;
  unmeasuredSnapshots: number;
  rejectedByMutex: number;
  overlappingSnapshotsEliminated: number;
}

export interface IndependentTradeStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION;
  policyId: HistoricalPositionOutcomePolicyId;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
  snapshotReference: IndependentTradeSnapshotReference;
  overall: IndependentTradeStatisticsSlice;
  evaluationCross: IndependentTradeEvaluationPolicyMatrix;
  pathOutcomeDistribution: IndependentTradePathOutcomeDistribution;
  duration: IndependentTradeDurationStatistics;
  cohorts: IndependentTradeCohortStatisticsMap;
  bySymbol: IndependentTradeSymbolStatisticsMap;
  byTimeframe: IndependentTradeTimeframeStatisticsMap;
  bySetupFamily: IndependentTradeSetupFamilyStatisticsMap;
  byDirection: IndependentTradeDirectionStatisticsMap;
  byRrBucket: IndependentTradeRrBucketStatisticsMap;
}

export type IndependentTradeStatisticsDenominatorId =
  HistoricalPositionOutcomePolicyDenominatorId;
