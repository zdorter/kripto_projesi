import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomePolicyDenominatorId } from "./historical-position-outcome-policy-types";
import type {
  HistoricalPositionOutcomePolicyId,
  HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";

export const HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

export interface HistoricalPositionOutcomeStatisticsObservation {
  entry: HistoricalMeasurementArtifactEntry;
  pathResult: HistoricalPositionPathResult;
}

export interface HistoricalPositionOutcomeStatisticsInput {
  /** Full artifact measurement count (pre-filter population reference). */
  totalArtifactSnapshots: number;
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[];
  filter?: HistoricalMeasurementStatisticsFilter;
  policyId?: HistoricalPositionOutcomePolicyId;
}

export interface HistoricalPositionOutcomeStatisticRate {
  numerator: number;
  denominator: number;
  value: number | null;
  denominatorId: HistoricalPositionOutcomePolicyDenominatorId;
}

export interface HistoricalPositionOutcomeStatisticsCounts {
  totalSnapshots: number;
  measuredPaths: number;
  unmeasuredPaths: number;
  favorableResolutions: number;
  adverseResolutions: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
  decisiveResolutions: number;
  measuredNonDecisive: number;
  /** Reporting alias for favorableResolutions. */
  wins: number;
  /** Reporting alias for adverseResolutions. */
  losses: number;
}

export interface HistoricalPositionOutcomeDenominators {
  filteredSnapshots: number;
  measuredPaths: number;
  unmeasuredPaths: number;
  decisiveResolutions: number;
  measuredNonDecisive: number;
}

export interface HistoricalPositionOutcomeStatisticsRates {
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
}

export type HistoricalPositionOutcomeClassificationDistribution = {
  [K in HistoricalPositionPolicyClassification]: number;
};

export const HISTORICAL_POSITION_OUTCOME_EVALUATION_ROWS: readonly TradeEvaluationStatus[] =
  ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export type HistoricalPositionOutcomeEvaluationPolicyMatrix = {
  [E in TradeEvaluationStatus]: {
    [C in HistoricalPositionPolicyClassification]: number;
  };
};

export type HistoricalPositionOutcomeDirectionSliceKey =
  | "BULLISH"
  | "BEARISH"
  | "UNRESOLVED"
  | "UNKNOWN";

export const HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS: readonly HistoricalPositionOutcomeDirectionSliceKey[] =
  ["BULLISH", "BEARISH", "UNRESOLVED", "UNKNOWN"];

export interface HistoricalPositionOutcomeStatisticsSlice {
  counts: HistoricalPositionOutcomeStatisticsCounts;
  denominators: HistoricalPositionOutcomeDenominators;
  classification: HistoricalPositionOutcomeClassificationDistribution;
  rates: HistoricalPositionOutcomeStatisticsRates;
}

export type HistoricalPositionOutcomeCohortStatisticsMap = {
  [K in HistoricalMeasurementCohort]: HistoricalPositionOutcomeStatisticsSlice;
};

export type HistoricalPositionOutcomeSymbolStatisticsMap = Record<
  string,
  HistoricalPositionOutcomeStatisticsSlice
>;

export type HistoricalPositionOutcomeTimeframeStatisticsMap = Record<
  string,
  HistoricalPositionOutcomeStatisticsSlice
>;

export type HistoricalPositionOutcomeSetupFamilyStatisticsMap = Record<
  string,
  HistoricalPositionOutcomeStatisticsSlice
>;

export type HistoricalPositionOutcomeDirectionStatisticsMap = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: HistoricalPositionOutcomeStatisticsSlice;
};

export type HistoricalPositionOutcomeRrBucketStatisticsMap = {
  [K in HistoricalMeasurementRRBucketRow]: HistoricalPositionOutcomeStatisticsSlice;
};

export interface HistoricalPositionOutcomeStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION;
  filter: HistoricalMeasurementStatisticsFilter;
  policyId: HistoricalPositionOutcomePolicyId;
  totalArtifactSnapshots: number;
  overall: HistoricalPositionOutcomeStatisticsSlice;
  evaluationCross: HistoricalPositionOutcomeEvaluationPolicyMatrix;
  cohorts: HistoricalPositionOutcomeCohortStatisticsMap;
  bySymbol: HistoricalPositionOutcomeSymbolStatisticsMap;
  byTimeframe: HistoricalPositionOutcomeTimeframeStatisticsMap;
  bySetupFamily: HistoricalPositionOutcomeSetupFamilyStatisticsMap;
  byDirection: HistoricalPositionOutcomeDirectionStatisticsMap;
  byRrBucket: HistoricalPositionOutcomeRrBucketStatisticsMap;
}
