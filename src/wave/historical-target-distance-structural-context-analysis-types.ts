import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEntryPriceMoveQualityAnalysisReport } from "./historical-entry-price-move-quality-analysis-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalTargetProvenanceStructuralDistanceAnalysisReport } from "./historical-target-provenance-structural-distance-analysis-types";
import type {
  IndependentTradeDurationBucketId,
  IndependentTradeSampleSizeQuality,
} from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";

export const HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const TARGET_DISTANCE_AGGREGATE_BAND_IDS = [
  "AGG_LT_0_25",
  "AGG_0_25_TO_0_50",
  "AGG_0_50_TO_1_00",
  "AGG_1_00_TO_2_00",
  "AGG_2_00_TO_3_00",
  "AGG_GTE_3_00",
  "AGG_NOT_APPLICABLE",
] as const;

export type TargetDistanceAggregateBandId =
  (typeof TARGET_DISTANCE_AGGREGATE_BAND_IDS)[number];

export const CONTEXT_HEADROOM_BUCKET_IDS = [
  "NO_HEADROOM",
  "HEADROOM_LT_0_25",
  "HEADROOM_0_25_TO_0_50",
  "HEADROOM_0_50_TO_1_00",
  "HEADROOM_1_00_TO_2_00",
  "HEADROOM_GTE_2_00",
  "HEADROOM_NOT_APPLICABLE",
] as const;

export type ContextHeadroomBucketId = (typeof CONTEXT_HEADROOM_BUCKET_IDS)[number];

export const DISPLACEMENT_CONTEXT_BUCKET_IDS = [
  "DISP_LT_0_25",
  "DISP_0_25_TO_0_50",
  "DISP_0_50_TO_1_00",
  "DISP_1_00_TO_2_00",
  "DISP_2_00_TO_3_00",
  "DISP_GTE_3_00",
  "DISP_NOT_APPLICABLE",
] as const;

export type DisplacementContextBucketId =
  (typeof DISPLACEMENT_CONTEXT_BUCKET_IDS)[number];

export type AnchorSourceDimension =
  | OpenStructuralLegAnchorSource
  | "MIXED"
  | "UNKNOWN";

export interface BuildHistoricalTargetDistanceStructuralContextAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport: HistoricalCostAwareCounterfactualAnalysisReport;
  entryPriceMoveQualityAnalysisReport?: HistoricalEntryPriceMoveQualityAnalysisReport;
  targetProvenanceStructuralDistanceAnalysisReport?: HistoricalTargetProvenanceStructuralDistanceAnalysisReport;
  displacementEqualityTargetMechanicsAnalysisReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
}

export interface ReachSliceMetrics {
  trades: number;
  classifiableTrades: number;
  targetReached: number;
  targetReachRate: number | null;
  reachRateWilson95: IndependentTradeWinRateConfidenceInterval;
  targetBeforeInvalidation: number;
  targetBeforeInvalidationRate: number | null;
  invalidationFirst: number;
  invalidationFirstRate: number | null;
  medianBarsToTarget: number | null;
  meanMfePercentage: number | null;
  meanCanonicalRewardPercentage: number | null;
  meanRiskPercentage: number | null;
  meanCanonicalRr: number | null;
  costCoveredAt0_10: number;
  costCoveredAt0_20: number;
  costCoveredAt0_30: number;
  costCoveredAt0_50: number;
  costCoverageRateAt0_20: number | null;
  meanGrossMarginOnReached: number | null;
  meanNetMarginOnReachedAt0_20: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface TargetDistanceHeadroomCell extends ReachSliceMetrics {
  targetDistanceBucket: PriceMoveRewardBucketId;
  headroomBucket: ContextHeadroomBucketId;
  decisive: number;
}

export interface StructuralContextTradeExample {
  tradeId: string;
  evaluationBarIndex: number;
  timestamp: number | null;
  direction: string;
  anchorPrice: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  canonicalRewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  displacementPercentage: number | null;
  structuralMovePercentage: number | null;
  headroomPercentage: number | null;
  anchorSource: AnchorSourceDimension;
  waveContext: string;
  durationBucket: IndependentTradeDurationBucketId | "UNKNOWN";
  evaluatorStatus: string;
  failureReason: string;
  pathOutcome: string;
  targetReached: boolean;
  barsToTarget: number | null;
  mfe: number | null;
  costCoveredAt0_20: boolean | null;
}

export interface HistoricalTargetDistanceStructuralContextAnalysisReport {
  schemaVersion: typeof HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION;
  datasetReference: {
    fixturePath: string;
    expectedDatasetChecksum: string;
  };
  population: {
    independentTrades: number;
    canonicalReplayClassifiable: number;
    canonicalNotReplayable: number;
  };
  canonicalSources: {
    targetDistanceBuckets: "B-12r PRICE_MOVE_REWARD_BUCKET_IDS";
    reachability: "B-12w CANONICAL_DISPLACEMENT_EQUALITY";
    costCoverage: "B-12x round-trip scenarios (0.10/0.20/0.30/0.50 on reached)";
    displacement: "B-12t perTrade when provided";
    headroom: "B-12u perTrade when provided";
    anchorWave: "B-12t/B-12v when provided";
  };
  targetDistanceFindings: {
    byRewardBucket: readonly (ReachSliceMetrics & { bucket: PriceMoveRewardBucketId })[];
    byAggregateBand: readonly (ReachSliceMetrics & { band: TargetDistanceAggregateBandId })[];
  };
  displacementFindings: readonly (ReachSliceMetrics & {
    bucket: DisplacementContextBucketId;
    meanDisplacementPercentage: number | null;
    medianDisplacementPercentage: number | null;
  })[];
  structuralHeadroomFindings: readonly (ReachSliceMetrics & {
    bucket: ContextHeadroomBucketId;
    prefixExtremeObservedAtECount: number;
  })[];
  anchorSourceFindings: readonly (ReachSliceMetrics & {
    anchorSource: AnchorSourceDimension;
  })[];
  anchorByTargetDistance: readonly (ReachSliceMetrics & {
    anchorSource: AnchorSourceDimension;
    targetDistanceBucket: PriceMoveRewardBucketId;
  })[];
  targetDistanceByHeadroom: readonly TargetDistanceHeadroomCell[];
  targetDistanceByDuration: readonly (ReachSliceMetrics & {
    targetDistanceBucket: PriceMoveRewardBucketId;
    durationBucket: IndependentTradeDurationBucketId | "UNKNOWN";
  })[];
  waveFindings: readonly (ReachSliceMetrics & {
    waveLabel: string;
    targetDistanceBucket: PriceMoveRewardBucketId;
  })[];
  setupFamilyFindings: readonly (ReachSliceMetrics & {
    setupFamilyId: string;
    targetDistanceBucket: PriceMoveRewardBucketId;
  })[];
  evaluatorFindings: readonly (ReachSliceMetrics & {
    evaluationStatus: string;
    targetDistanceBucket: PriceMoveRewardBucketId;
    failureReason: string | null;
  })[];
  pathOutcomeFindings: readonly (ReachSliceMetrics & {
    pathOutcome: string;
    targetDistanceBucket: PriceMoveRewardBucketId;
  })[];
  costFindings: readonly {
    roundTripCostPercentage: number;
    byTargetDistanceBucket: readonly (ReachSliceMetrics & {
      bucket: PriceMoveRewardBucketId;
    })[];
  }[];
  largeTargetFindings: readonly (ReachSliceMetrics & {
    rewardThresholdPercent: number;
  })[];
  failedFavorableAnalysis: {
    trades: number;
    byTargetSizeBand: readonly { band: string; trades: number }[];
    slice: ReachSliceMetrics;
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    slice: ReachSliceMetrics;
    note: string;
  };
  directVsAssociational: {
    directMeasurements: readonly string[];
    associationalMeasurements: readonly string[];
  };
  tradeExamples: readonly StructuralContextTradeExample[];
  diagnosticSummary: readonly { question: string; answer: string; classification: "DIRECT" | "ASSOCIATIONAL" }[];
  warnings: readonly string[];
  consumedReports: {
    lifecycleReport: true;
    reachabilityReplayReport: true;
    costAwareCounterfactualAnalysisReport: true;
    entryPriceMoveQualityAnalysisReport: boolean;
    targetProvenanceStructuralDistanceAnalysisReport: boolean;
    displacementEqualityTargetMechanicsAnalysisReport: boolean;
    structuralExtremeVsDisplacementTargetAnalysisReport: boolean;
    alternativeTargetModelAnalysisReport: boolean;
  };
}
