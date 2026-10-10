import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeRMultipleRejectionReason } from "./historical-independent-trade-r-multiple-contract";
import { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "./historical-independent-trade-r-multiple-contract";

export const HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

export type IndependentTradeRMultipleRejectionCounts = {
  [R in IndependentTradeRMultipleRejectionReason]: number;
};

export interface IndependentTradeRMultipleOverallStatistics {
  totalTrades: number;
  validRiskTrades: number;
  invalidRiskTrades: number;
  decisiveTrades: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  tradesWithTheoreticalR: number;
  /** Decisive trades with no theoretical R (invalid reference geometry, etc.). */
  decisiveWithoutTheoreticalR: number;
  sumR: number;
  averageR: number | null;
  medianR: number | null;
  minR: number | null;
  maxR: number | null;
  positiveRCount: number;
  negativeRCount: number;
  zeroRCount: number;
  expectancyR: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  lossRateDecisive: HistoricalPositionOutcomeStatisticRate;
  profitFactorR: number | null;
  /** Kontrol: (winRate * averageWinR) + (lossRate * averageLossR) ≈ expectancyR */
  expectancyRFromWinLossComponents: number | null;
  rejectionCounts: IndependentTradeRMultipleRejectionCounts;
}

export interface IndependentTradeRMultipleSliceStatistics {
  decisive: number;
  wins: number;
  losses: number;
  tradesWithTheoreticalR: number;
  winRate: HistoricalPositionOutcomeStatisticRate;
  averageWinR: number | null;
  averageLossR: number | null;
  expectancyR: number | null;
  profitFactorR: number | null;
  sumR: number;
  sampleSize: number;
}

export type IndependentTradeRMultipleDirectionMap = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: IndependentTradeRMultipleSliceStatistics;
};

export type IndependentTradeRMultipleRrBucketMap = {
  [K in HistoricalMeasurementRRBucketRow]: IndependentTradeRMultipleSliceStatistics;
};

export type IndependentTradeRMultipleEvaluationMap = {
  [K in Extract<
    TradeEvaluationStatus,
    "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
  >]: IndependentTradeRMultipleSliceStatistics;
};

export type IndependentTradeRMultipleExitReasonMap = {
  [K in ProspectiveSetupOutcomeReplayStatus]: IndependentTradeRMultipleSliceStatistics;
};

export type IndependentTradeRMultipleCohortMap = {
  [K in HistoricalMeasurementCohort]: IndependentTradeRMultipleSliceStatistics;
};

export type IndependentTradeRMultipleSetupFamilyMap = Record<
  string,
  IndependentTradeRMultipleSliceStatistics
>;

export interface HistoricalIndependentTradeRMultipleStatisticsReport {
  schemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION;
  rMultipleContractVersion: typeof HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION;
  policyId: HistoricalPositionOutcomePolicyId;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
  populationKind: "INDEPENDENT_TRADE_THEORETICAL_R_MULTIPLE";
  snapshotReference: IndependentTradeSnapshotReference;
  /** Gözlemsel tarihsel teorik R performansı; kârlılık / trade edilebilirlik iddiası değildir. */
  analysisScopeNote: string;
  prospectiveVsRealizedRNote: string;
  overall: IndependentTradeRMultipleOverallStatistics;
  byDirection: IndependentTradeRMultipleDirectionMap;
  byRrBucket: IndependentTradeRMultipleRrBucketMap;
  bySetupFamily: IndependentTradeRMultipleSetupFamilyMap;
  byEvaluation: IndependentTradeRMultipleEvaluationMap;
  byExitReason: IndependentTradeRMultipleExitReasonMap;
  byCohort: IndependentTradeRMultipleCohortMap;
}

export interface AggregateIndependentTradeRMultipleStatisticsInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  /** İsteğe bağlı B-12c parity kontrolü (sayılar değiştirilmez). */
  statisticsReport?: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
}
