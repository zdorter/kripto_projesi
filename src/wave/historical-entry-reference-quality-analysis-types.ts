import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { TheoreticalRGeometryClassification } from "./historical-independent-trade-r-eligibility-audit-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";

export const HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

/**
 * B-12j descriptive geometry quality (B-12g/B-12h audit sınıflarından türetilir).
 * Yeni geometry kuralı icat edilmez.
 */
export const ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS = [
  "CONSISTENT_GEOMETRY",
  "INCONSISTENT_TARGET_DIRECTION",
  "INVALID_RISK_REFERENCE",
  "INSUFFICIENT_GEOMETRY",
] as const;

export type EntryReferenceGeometryQuality =
  (typeof ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS)[number];

export const ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_CONTRACT_VERSION =
  "1.0" as const;

/**
 * Risk mesafesi bucket'ları — yalnızca gözlemsel analiz (strateji önerisi değil).
 * riskDistancePercentage = riskDistance / entryReferencePrice (geometry-valid trades).
 */
export const ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS = [
  "TIGHT_RISK",
  "MEDIUM_RISK",
  "WIDE_RISK",
  "NOT_APPLICABLE",
] as const;

export type EntryReferenceRiskDistanceBucketId =
  (typeof ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS)[number];

/** TIGHT: < 0.4%; MEDIUM: [0.4%, 1.2%); WIDE: >= 1.2% (BTC 1H referansları için kaba dilimler). */
export const ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS = {
  tightMaxExclusive: 0.004,
  mediumMaxExclusive: 0.012,
} as const;

export const ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_CONTRACT_VERSION =
  "1.0" as const;

export const ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS = [
  "SHORT_REWARD",
  "MEDIUM_REWARD",
  "LONG_REWARD",
  "NOT_APPLICABLE",
] as const;

export type EntryReferenceRewardDistanceBucketId =
  (typeof ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS)[number];

/** SHORT: < 0.8%; MEDIUM: [0.8%, 2.4%); LONG: >= 2.4%. */
export const ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS = {
  shortMaxExclusive: 0.008,
  mediumMaxExclusive: 0.024,
} as const;

export interface EntryReferenceQualityOutcomeSlice {
  trades: number;
  measuredTrades: number;
  unmeasuredTrades: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
  averageTheoreticalR: number | null;
  theoreticalRTradeCount: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  /** Gözlemsel; nedensellik iddiası yok. */
  descriptiveOnly: true;
}

export type EntryReferenceQualityByGeometry = {
  [K in EntryReferenceGeometryQuality]: EntryReferenceQualityOutcomeSlice;
};

export type EntryReferenceQualityByRiskDistance = {
  [K in EntryReferenceRiskDistanceBucketId]: EntryReferenceQualityOutcomeSlice;
};

export type EntryReferenceQualityByRewardDistance = {
  [K in EntryReferenceRewardDistanceBucketId]: EntryReferenceQualityOutcomeSlice;
};

export interface EntryReferenceEvaluationCrossCell {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
}

export type EntryReferenceGeometryEvaluationCross = {
  [G in EntryReferenceGeometryQuality]: {
    [E in Extract<
      TradeEvaluationStatus,
      "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
    >]: EntryReferenceEvaluationCrossCell;
  };
};

export interface EntryReferenceDirectionGeometrySlice {
  geometryDistribution: Record<EntryReferenceGeometryQuality, number>;
  byGeometry: EntryReferenceQualityByGeometry;
  decisiveWinRateOverall: HistoricalPositionOutcomeStatisticRate;
}

export type EntryReferenceDirectionCross = {
  [K in HistoricalPositionOutcomeDirectionSliceKey]: EntryReferenceDirectionGeometrySlice;
};

export interface EntryReferenceRrGeometrySlice {
  geometryDistribution: Record<EntryReferenceGeometryQuality, number>;
  byGeometry: EntryReferenceQualityByGeometry;
}

export type EntryReferenceRrCross = {
  [K in HistoricalMeasurementRRBucketRow]: EntryReferenceRrGeometrySlice;
};

export interface EntryReferenceDurationGeometrySlice {
  geometryDistribution: Record<EntryReferenceGeometryQuality, number>;
  byGeometry: EntryReferenceQualityByGeometry;
}

export type EntryReferenceDurationCross = {
  [K in IndependentTradeDurationBucketId]: EntryReferenceDurationGeometrySlice;
};

export interface EntryReferenceInvalidGeometryDetail {
  decisiveTrades: number;
  theoreticalRUnavailable: number;
  percentageOfDecisive: number | null;
  geometryClassification: TheoreticalRGeometryClassification;
  count: number;
  directionDistribution: Record<HistoricalPositionOutcomeDirectionSliceKey, number>;
  evaluationDistribution: Record<
    Extract<TradeEvaluationStatus, "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT">,
    number
  >;
  outcomeDistribution: {
    wins: number;
    losses: number;
  };
  setupFamilyDistribution: Record<string, number>;
  prospectiveRrBucketDistribution: Record<HistoricalMeasurementRRBucketRow, number>;
}

export interface EntryReferenceInvalidGeometrySection {
  summary: {
    decisiveTrades: number;
    unavailableCount: number;
    percentageOfDecisive: number | null;
    primaryClassification: EntryReferenceGeometryQuality;
  };
  /** B-12c WIN/LOSS sayıları değişmez; diagnostic görünüm. */
  unavailableDecisiveOutcomes: {
    wins: number;
    losses: number;
    winRate_decisive: HistoricalPositionOutcomeStatisticRate;
  };
  details: readonly EntryReferenceInvalidGeometryDetail[];
  note: string;
}

export interface EntryReferenceQualityOverall {
  totalTrades: number;
  measuredTrades: number;
  decisive: number;
  wins: number;
  losses: number;
  geometryDistribution: Record<EntryReferenceGeometryQuality, number>;
  consistentGeometryShare: number | null;
  inconsistentGeometryShare: number | null;
  /** B-12g overall (değiştirilmez; referans). */
  b12gExpectancyR: number | null;
  b12gSumR: number;
  b12gProfitFactorR: number | null;
}

export interface EntryReferenceAnalysisQuestionAnswer {
  questionId: string;
  question: string;
  observation: string;
  descriptiveOnly: true;
}

export interface HistoricalEntryReferenceQualityAnalysisReport {
  schemaVersion: typeof HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_ENTRY_REFERENCE_QUALITY";
  consumedReports: {
    statisticsSchemaVersion: string;
    rMultipleSchemaVersion: string;
    eligibilityAuditSchemaVersion: string;
    theoreticalPerformanceSchemaVersion: string | null;
  };
  population: {
    snapshotReference: IndependentTradeSnapshotReference;
    independentTrades: number;
    note: string;
  };
  overall: EntryReferenceQualityOverall;
  geometry: EntryReferenceQualityByGeometry;
  riskDistance: {
    contractVersion: typeof ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_CONTRACT_VERSION;
    descriptiveOnlyNote: string;
    thresholds: typeof ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS;
    byBucket: EntryReferenceQualityByRiskDistance;
  };
  rewardDistance: {
    contractVersion: typeof ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_CONTRACT_VERSION;
    descriptiveOnlyNote: string;
    thresholds: typeof ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS;
    byBucket: EntryReferenceQualityByRewardDistance;
  };
  evaluationCross: EntryReferenceGeometryEvaluationCross;
  directionCross: EntryReferenceDirectionCross;
  rrCross: EntryReferenceRrCross;
  durationCross: EntryReferenceDurationCross;
  invalidGeometry: EntryReferenceInvalidGeometrySection;
  prospectiveVsTheoreticalR: {
    prospectiveRrField: string;
    theoreticalRField: string;
    note: string;
  };
  analysisQuestions: readonly EntryReferenceAnalysisQuestionAnswer[];
  warnings: readonly string[];
}

export interface BuildHistoricalEntryReferenceQualityAnalysisInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  statisticsReport: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  rMultipleStatisticsReport: import("./historical-independent-trade-r-multiple-statistics-types").HistoricalIndependentTradeRMultipleStatisticsReport;
  eligibilityAuditReport: import("./historical-independent-trade-r-eligibility-audit-types").HistoricalIndependentTradeREligibilityAuditReport;
  theoreticalPerformanceReport?: import("./historical-theoretical-performance-report-types").HistoricalTheoreticalPerformanceReport;
  /** Decisive audit row geometry parity (B-12h). */
  assertAuditGeometryParity?: boolean;
}
