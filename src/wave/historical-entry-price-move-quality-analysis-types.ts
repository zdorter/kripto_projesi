import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { RrThresholdTheoreticalRProspectiveBandId } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import type { RrThresholdProspectiveBandComparisonRow } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

export const HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const PRICE_MOVE_REWARD_BUCKET_CONTRACT_VERSION = "1.0" as const;

/** Descriptive reward % buckets (percent units, e.g. 0.25 = 0.25%). Half-open except last. */
export const PRICE_MOVE_REWARD_BUCKET_IDS = [
  "REWARD_LT_0_10",
  "REWARD_0_10_TO_0_25",
  "REWARD_0_25_TO_0_50",
  "REWARD_0_50_TO_1_00",
  "REWARD_1_00_TO_2_00",
  "REWARD_2_00_TO_3_00",
  "REWARD_GTE_3_00",
  "REWARD_NOT_APPLICABLE",
] as const;

export type PriceMoveRewardBucketId =
  (typeof PRICE_MOVE_REWARD_BUCKET_IDS)[number];

export const PRICE_MOVE_REWARD_BUCKET_THRESHOLDS_PERCENT = {
  lt0_10MaxExclusive: 0.1,
  to0_25MaxExclusive: 0.25,
  to0_50MaxExclusive: 0.5,
  to1_00MaxExclusive: 1.0,
  to2_00MaxExclusive: 2.0,
  to3_00MaxExclusive: 3.0,
} as const;

export const PRICE_MOVE_RISK_BUCKET_CONTRACT_VERSION = "1.0" as const;

export const PRICE_MOVE_RISK_BUCKET_IDS = [
  "RISK_LT_0_25",
  "RISK_0_25_TO_0_50",
  "RISK_0_50_TO_1_00",
  "RISK_1_00_TO_2_00",
  "RISK_2_00_TO_3_00",
  "RISK_GTE_3_00",
  "RISK_NOT_APPLICABLE",
] as const;

export type PriceMoveRiskBucketId = (typeof PRICE_MOVE_RISK_BUCKET_IDS)[number];

export const PRICE_MOVE_RISK_BUCKET_THRESHOLDS_PERCENT = {
  lt0_25MaxExclusive: 0.25,
  to0_50MaxExclusive: 0.5,
  to1_00MaxExclusive: 1.0,
  to2_00MaxExclusive: 2.0,
  to3_00MaxExclusive: 3.0,
} as const;

export type PriceMoveGeometryValidity =
  | "VALID"
  | "INVALID_DIRECTION"
  | "INVALID_ENTRY"
  | "INVALID_TARGET_GEOMETRY"
  | "INVALID_RISK_GEOMETRY"
  | "MISSING_REFERENCE";

export interface PriceMoveGrossFields {
  grossRewardPercentage: number | null;
  grossRiskPercentage: number | null;
  prospectiveRR: number | null;
  roundTripCostPercentage: null;
  roundTripCostStatus: "NOT_APPLIED";
}

export interface PriceMoveRrValidation {
  canonicalRrRatio: number | null;
  impliedRrFromPercentages: number | null;
  absoluteDelta: number | null;
  withinTolerance: boolean | null;
  tolerance: number;
  note: string;
}

export interface PriceMovePerTradeRow {
  tradeId: string;
  evaluationBarIndex: number;
  evaluationBarTime: number | null;
  direction: "BULLISH" | "BEARISH" | "UNRESOLVED" | null;
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  gross: PriceMoveGrossFields;
  geometryValidity: PriceMoveGeometryValidity;
  rewardBucket: PriceMoveRewardBucketId;
  riskBucket: PriceMoveRiskBucketId;
  prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
  b12pProspectiveBandId: RrThresholdTheoreticalRProspectiveBandId | null;
  rrValidation: PriceMoveRrValidation;
  tradeEvaluationStatus: TradeEvaluationStatus;
  evaluatorFirstFailure: TradeEvaluationFirstFailureCode | null;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: HistoricalPositionPolicyClassification;
  lifecycleDurationBars: number | null;
  theoreticalR: number | null;
  failedWin: boolean;
  passedLoss: boolean;
}

export interface PriceMoveBucketMetrics {
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  averageTheoreticalR: number | null;
  theoreticalRTradeCount: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  averageGrossRewardPercentage: number | null;
  averageGrossRiskPercentage: number | null;
}

export type PriceMoveRewardBucketTable = {
  [K in PriceMoveRewardBucketId]: PriceMoveBucketMetrics;
};

export type PriceMoveRiskBucketTable = {
  [K in PriceMoveRiskBucketId]: PriceMoveBucketMetrics;
};

export interface PriceMoveRiskRewardCrossCell extends PriceMoveBucketMetrics {
  riskBucket: PriceMoveRiskBucketId;
  rewardBucket: PriceMoveRewardBucketId;
}

export interface PriceMoveRrRewardCrossCell extends PriceMoveBucketMetrics {
  prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
  rewardBucket: PriceMoveRewardBucketId;
}

export interface PriceMovePathOutcomeSlice extends PriceMoveBucketMetrics {
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
}

export interface PriceMoveFailedWinTradeDetail {
  tradeId: string;
  evaluationBarIndex: number;
  direction: PriceMovePerTradeRow["direction"];
  grossRewardPercentage: number | null;
  grossRiskPercentage: number | null;
  canonicalRrRatio: number | null;
  lifecycleDurationBars: number | null;
  evaluatorFirstFailure: TradeEvaluationFirstFailureCode | null;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: HistoricalPositionPolicyClassification;
  theoreticalR: number | null;
}

export interface PriceMoveB12pBandEnrichment {
  bandId: RrThresholdTheoreticalRProspectiveBandId;
  /** Frozen B-12p row (not recomputed). */
  b12pMetrics: RrThresholdProspectiveBandComparisonRow | null;
  averageGrossRewardPercentage: number | null;
  averageGrossRiskPercentage: number | null;
  medianGrossRewardPercentage: number | null;
}

export interface PriceMoveResearchQuestionAnswer {
  questionId: string;
  question: string;
  observation: string;
  descriptiveOnly: true;
}

export interface BuildHistoricalEntryPriceMoveQualityAnalysisInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  eligibilityAuditReport: import("./historical-independent-trade-r-eligibility-audit-types").HistoricalIndependentTradeREligibilityAuditReport;
  /** Optional frozen B-12p output — consumed as-is for band metrics. */
  rrThresholdTheoreticalRAnalysisReport?: import("./historical-evaluator-rr-threshold-theoretical-r-analysis-types").HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport;
}

export interface HistoricalEntryPriceMoveQualityAnalysisReport {
  schemaVersion: typeof HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_PRICE_MOVE_QUALITY";
  consumedReports: {
    lifecycleSchemaVersion: string;
    eligibilityAuditSchemaVersion: string;
    b12pSchemaVersion: string | null;
  };
  metricDefinitions: {
    priceMovePercentage: string;
    riskPercentage: string;
    prospectiveRR: string;
    theoreticalR: string;
    note: string;
  };
  lookaheadAttestation: {
    rewardRiskDerivedFromEvaluationReferencesOnly: true;
    futureBarsUsedForOutcomeOnly: true;
    detail: string;
  };
  rewardBuckets: {
    contractVersion: typeof PRICE_MOVE_REWARD_BUCKET_CONTRACT_VERSION;
    thresholdsPercent: typeof PRICE_MOVE_REWARD_BUCKET_THRESHOLDS_PERCENT;
    descriptiveOnlyNote: string;
    byBucket: PriceMoveRewardBucketTable;
  };
  riskBuckets: {
    contractVersion: typeof PRICE_MOVE_RISK_BUCKET_CONTRACT_VERSION;
    thresholdsPercent: typeof PRICE_MOVE_RISK_BUCKET_THRESHOLDS_PERCENT;
    descriptiveOnlyNote: string;
    byBucket: PriceMoveRiskBucketTable;
  };
  riskRewardCross: readonly PriceMoveRiskRewardCrossCell[];
  rrRewardCross: readonly PriceMoveRrRewardCrossCell[];
  pathOutcomeSlices: readonly PriceMovePathOutcomeSlice[];
  b12pProspectiveBandReference: {
    sourceField: "prospectiveBandComparison";
    enrichments: readonly PriceMoveB12pBandEnrichment[];
    notRecomputedNote: string;
  };
  failedWinAnalysis: {
    totalFailedWin: number;
    byEvaluatorFirstFailure: Record<string, number>;
    trades: readonly PriceMoveFailedWinTradeDetail[];
    rewardBucketDistribution: Partial<Record<PriceMoveRewardBucketId, number>>;
    riskBucketDistribution: Partial<Record<PriceMoveRiskBucketId, number>>;
  };
  rrValidationSummary: {
    tradesWithBothPercentages: number;
    withinToleranceCount: number;
    mismatchCount: number;
    tolerance: number;
  };
  tradeExamples: readonly PriceMovePerTradeRow[];
  analysisQuestions: readonly PriceMoveResearchQuestionAnswer[];
  warnings: readonly string[];
}
