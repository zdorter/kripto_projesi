import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "./historical-independent-trade-r-multiple-contract";
import type { HistoricalIndependentTradeRMultipleStatisticsReport } from "./historical-independent-trade-r-multiple-statistics-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticalValidationReport } from "./historical-independent-trade-statistical-validation-types";

export const HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION =
  "1.0" as const;

export const THEORETICAL_PERFORMANCE_EXPECTANCY_TOLERANCE = 1e-9 as const;

export const THEORETICAL_PERFORMANCE_LOSS_R_TOLERANCE = 1e-12 as const;

export type TheoreticalPerformanceExpectancyValidation =
  | "CONSISTENT"
  | "INCONSISTENT";

export type TheoreticalPerformanceInterpretationFlag =
  | "POSITIVE_EXPECTANCY"
  | "NEGATIVE_EXPECTANCY"
  | "ZERO_EXPECTANCY"
  | "INSUFFICIENT_R_DATA"
  | "HIGH_INVALID_GEOMETRY_RATE";

export type TheoreticalPerformanceEvaluatorObservation =
  | "OBSERVATIONAL_DIFFERENCE"
  | "INSUFFICIENT_SAMPLE";

export interface TheoreticalPerformancePopulation {
  snapshotReference: IndependentTradeSnapshotReference;
  referencePopulationNote: string;
  liveDatasetDriftNote: string | null;
}

export interface TheoreticalPerformanceOverall {
  totalTrades: number;
  decisiveTrades: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  validTheoreticalRTrades: number;
  decisiveWithoutTheoreticalR: number;
  invalidRiskTrades: number;
  sumR: number;
  averageR: number | null;
  medianR: number | null;
  minR: number | null;
  maxR: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  grossPositiveR: number;
  grossNegativeR: number;
  profitFactorR: number | null;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  lossRateDecisive: HistoricalPositionOutcomeStatisticRate;
  expectancyR: number | null;
  expectancyRFromComponents: number | null;
  expectancyValidation: TheoreticalPerformanceExpectancyValidation;
  expectancyValidationDelta: number | null;
}

export interface TheoreticalPerformanceRDistribution {
  positiveRCount: number;
  negativeRCount: number;
  zeroRCount: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  outlierHighR: number | null;
  outlierLowR: number | null;
}

export interface TheoreticalPerformanceWinLossSide {
  count: number;
  rate: HistoricalPositionOutcomeStatisticRate;
  averageR: number | null;
  medianR: number | null;
  minR: number | null;
  maxR: number | null;
  lossRInvariantHolds: boolean | null;
}

export interface TheoreticalPerformanceBreakEven {
  breakEvenWinRate: number | null;
  actualWinRate: number | null;
  edgeOverBreakEven: number | null;
  note: string;
}

export interface TheoreticalPerformanceDimensionSlice {
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  winRate: HistoricalPositionOutcomeStatisticRate;
  averageWinR: number | null;
  averageLossR: number | null;
  expectancyR: number | null;
  profitFactorR: number | null;
  sumR: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  winRateDeltaFromOverall: number | null;
  expectancyDeltaFromOverall: number | null;
  averageDurationBars: number | null;
}

export type TheoreticalPerformanceByDirection = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: TheoreticalPerformanceDimensionSlice;
};

export type TheoreticalPerformanceByRrBucket = {
  [K in HistoricalMeasurementRRBucketRow]: TheoreticalPerformanceDimensionSlice;
};

export type TheoreticalPerformanceByEvaluation = {
  [K in Extract<
    TradeEvaluationStatus,
    "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
  >]: TheoreticalPerformanceDimensionSlice & {
    evaluatorObservation: TheoreticalPerformanceEvaluatorObservation;
  };
};

export type TheoreticalPerformanceBySetupFamily = Record<
  string,
  TheoreticalPerformanceDimensionSlice
>;

export interface TheoreticalPerformanceExitReasonSlice {
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  label: string;
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  winRate: HistoricalPositionOutcomeStatisticRate;
  expectancyR: number | null;
  profitFactorR: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export type TheoreticalPerformanceByDuration = {
  [K in IndependentTradeDurationBucketId]: TheoreticalPerformanceDimensionSlice & {
    averageR: number | null;
  };
};

export type TheoreticalPerformanceByCohort = {
  [K in HistoricalMeasurementCohort]: TheoreticalPerformanceDimensionSlice;
};

export interface TheoreticalPerformanceProspectiveVsTheoreticalR {
  prospectiveRrSource: string;
  theoreticalOutcomeRSource: string;
  note: string;
  rrConsistencyFromAudit: {
    decisiveWithComparableRr: number;
    withinToleranceCount: number;
    outsideToleranceCount: number;
  };
}

export interface TheoreticalPerformanceInvalidGeometryImpact {
  decisiveTrades: number;
  theoreticalRAvailable: number;
  theoreticalRUnavailable: number;
  percentageUnavailable: number | null;
  primaryRejectionReason: string;
  unavailableCountByGeometry: Record<string, number>;
}

export interface TheoreticalPerformancePopulationViews {
  canonicalTheoreticalRPopulation: {
    description: string;
    validTheoreticalRTrades: number;
  };
  diagnosticDecisivePopulation: {
    description: string;
    decisiveTrades: number;
  };
}

export interface TheoreticalPerformanceStatisticalContext {
  overallWins: number;
  overallDecisive: number;
  overallWinRate: number | null;
  wilson95Lower: number | null;
  wilson95Upper: number | null;
  baseline50pValue: number | null;
  significantAt95: boolean;
  note: string;
}

export interface TheoreticalPerformanceInterpretationFlags {
  flags: readonly TheoreticalPerformanceInterpretationFlag[];
  definitions: Record<TheoreticalPerformanceInterpretationFlag, string>;
}

export interface TheoreticalPerformanceWarnings {
  historicalTheoreticalOnly: string;
  noExecutionSimulation: string;
  noFees: string;
  noSlippage: string;
  noFunding: string;
  noPositionSizing: string;
  temporalDependence: string;
  overlappingHistoricalObservations: string;
  regimeDependence: string;
  invalidGeometryExcludedFromR: string;
  prospectiveRrIsNotRealizedR: string;
  notRealMoney: string;
}

export interface HistoricalTheoreticalPerformanceReport {
  schemaVersion: typeof HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION;
  rMultipleContractVersion: typeof HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION;
  policyId: HistoricalPositionOutcomePolicyId;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
  populationKind: "HISTORICAL_THEORETICAL_PERFORMANCE";
  consumedReports: {
    statisticsSchemaVersion: string;
    rMultipleSchemaVersion: string;
    eligibilityAuditSchemaVersion: string;
    validationSchemaVersion: string | null;
  };
  population: TheoreticalPerformancePopulation;
  overall: TheoreticalPerformanceOverall;
  rDistribution: TheoreticalPerformanceRDistribution;
  winAnalysis: TheoreticalPerformanceWinLossSide;
  lossAnalysis: TheoreticalPerformanceWinLossSide;
  breakEven: TheoreticalPerformanceBreakEven;
  byDirection: TheoreticalPerformanceByDirection;
  byRrBucket: TheoreticalPerformanceByRrBucket;
  byEvaluation: TheoreticalPerformanceByEvaluation;
  bySetupFamily: TheoreticalPerformanceBySetupFamily;
  byExitReason: TheoreticalPerformanceExitReasonSlice[];
  byDuration: TheoreticalPerformanceByDuration;
  byCohort: TheoreticalPerformanceByCohort;
  prospectiveVsTheoreticalR: TheoreticalPerformanceProspectiveVsTheoreticalR;
  invalidGeometryImpact: TheoreticalPerformanceInvalidGeometryImpact;
  populationViews: TheoreticalPerformancePopulationViews;
  statisticalContext: TheoreticalPerformanceStatisticalContext | null;
  interpretationFlags: TheoreticalPerformanceInterpretationFlags;
  warnings: TheoreticalPerformanceWarnings;
}

export interface BuildHistoricalTheoreticalPerformanceReportInput {
  statisticsReport: IndependentTradeStatisticsReport;
  rMultipleStatisticsReport: HistoricalIndependentTradeRMultipleStatisticsReport;
  eligibilityAuditReport: HistoricalIndependentTradeREligibilityAuditReport;
  /** Duration / averageDuration için (R yeniden hesaplanmaz). */
  lifecycleReport?: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  validationReport?: IndependentTradeStatisticalValidationReport;
}
