import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEntryPriceMoveQualityAnalysisReport } from "./historical-entry-price-move-quality-analysis-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalTargetDistanceStructuralContextAnalysisReport } from "./historical-target-distance-structural-context-analysis-types";
import type {
  ContextHeadroomBucketId,
  DisplacementContextBucketId,
  TargetDistanceAggregateBandId,
} from "./historical-target-distance-structural-context-analysis-types";
import type {
  IndependentTradeDurationBucketId,
  IndependentTradeSampleSizeQuality,
} from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";

export const HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

/** Descriptive alias over B-12r `PriceMoveRewardBucketId` (contract unchanged). */
export const TARGET_DISTANCE_BAND_IDS = [
  "TARGET_LT_0_10",
  "TARGET_0_10_TO_0_25",
  "TARGET_0_25_TO_0_50",
  "TARGET_0_50_TO_1_00",
  "TARGET_1_00_TO_2_00",
  "TARGET_2_00_TO_3_00",
  "TARGET_GTE_3_00",
] as const;

export type TargetDistanceBandId = (typeof TARGET_DISTANCE_BAND_IDS)[number];

export type AnchorSourceDimension =
  | OpenStructuralLegAnchorSource
  | "MIXED"
  | "UNKNOWN";

export interface BuildHistoricalTargetDistanceReachabilityCostBalanceAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport: HistoricalCostAwareCounterfactualAnalysisReport;
  eligibilityAuditReport: HistoricalIndependentTradeREligibilityAuditReport;
  structuralContextAnalysisReport?: HistoricalTargetDistanceStructuralContextAnalysisReport;
  entryPriceMoveQualityAnalysisReport?: HistoricalEntryPriceMoveQualityAnalysisReport;
  displacementEqualityTargetMechanicsAnalysisReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
}

export interface TargetDistanceBandBalanceRow {
  targetDistanceBand: TargetDistanceBandId;
  b12rRewardBucket: PriceMoveRewardBucketId;
  trades: number;
  classifiable: number;
  notReplayable: number;
  targetReached: number;
  targetReachRate: number | null;
  reachRateWilson95: IndependentTradeWinRateConfidenceInterval;
  targetBeforeInvalidation: number;
  invalidationFirst: number;
  ambiguous: number;
  noTouch: number;
  unresolved: number;
  medianBarsToTarget: number | null;
  p25BarsToTarget: number | null;
  p75BarsToTarget: number | null;
  meanMfe: number | null;
  medianMfe: number | null;
  mfeToTargetRatio: number | null;
  mfeGteTargetCount: number;
  costCoverageAt0_10: number | null;
  costCoverageAt0_20: number | null;
  costCoverageAt0_30: number | null;
  costCoverageAt0_50: number | null;
  meanGrossMarginOnReached: number | null;
  medianGrossMarginOnReached: number | null;
  meanNetMarginOnReachedAt0_20: number | null;
  medianNetMarginOnReachedAt0_20: number | null;
  theoreticalREligibleDecisive: number;
  sumR: number;
  expectancyR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  profitFactorR: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface CostSensitivityCell {
  roundTripCostPercentage: number;
  reached: number;
  costCovered: number;
  coverageRate: number | null;
  meanNetMargin: number | null;
}

export interface BalanceAnalysisRow {
  targetDistanceBand: TargetDistanceBandId;
  reachRate: number | null;
  costCoverageRateAt0_20: number | null;
  medianBarsToTarget: number | null;
  mfeToTargetRatio: number | null;
  expectancyR: number | null;
  profitFactorR: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  descriptiveTradeoffNote: string;
}

export interface BalanceTradeExample {
  tradeId: string;
  timestamp: number | null;
  evaluationBarIndex: number;
  direction: string;
  anchorPrice: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  displacementPercentage: number | null;
  structuralMovePercentage: number | null;
  headroomPercentage: number | null;
  targetDistanceBucket: TargetDistanceBandId;
  hasStructuralHeadroom: boolean;
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
  theoreticalR: number | null;
}

export interface HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport {
  schemaVersion: typeof HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION;
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
    targetBands: "B-12r PRICE_MOVE_REWARD_BUCKET contract (alias TARGET_*)";
    reachability: "B-12w CANONICAL_DISPLACEMENT_EQUALITY";
    cost: "B-12x round-trip scenarios";
    theoreticalR: "B-12h eligibilityAudit decisiveRows (not recomputed)";
    structuralContext: "B-12y optional reference";
  };
  targetDistanceBalanceTable: readonly TargetDistanceBandBalanceRow[];
  observedReachMonotonicity: {
    byIncreasingTargetDistance: "MONOTONIC_DECREASING" | "NOT_MONOTONIC" | "INSUFFICIENT_BANDS";
    note: string;
  };
  costSensitivityMatrix: readonly {
    targetDistanceBand: TargetDistanceBandId;
    cells: readonly CostSensitivityCell[];
  }[];
  mfeAnalysis: readonly {
    targetDistanceBand: TargetDistanceBandId;
    meanMfe: number | null;
    medianMfe: number | null;
    mfeToTargetRatio: number | null;
    mfeGteTargetRate: number | null;
    mfeGteTargetButNotReached: number;
    note: string;
  }[];
  targetDistanceByHeadroom: readonly {
    targetDistanceBand: TargetDistanceBandId;
    headroomBucket: ContextHeadroomBucketId;
    trades: number;
    targetReachRate: number | null;
    medianBarsToTarget: number | null;
    meanMfe: number | null;
    costCoverageRateAt0_20: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  targetDistanceByDisplacement: readonly {
    targetDistanceBand: TargetDistanceBandId;
    displacementBucket: DisplacementContextBucketId;
    trades: number;
    targetReachRate: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
  }[];
  anchorByTargetBand: readonly {
    anchorSource: AnchorSourceDimension;
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReachRate: number | null;
  }[];
  anchorSourceCoverageNote: string;
  waveByTargetBand: readonly {
    waveLabel: string;
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReachRate: number | null;
    interpretWithCaution: boolean;
  }[];
  setupFamilyByTargetBand: readonly {
    setupFamilyId: string;
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReachRate: number | null;
    interpretWithCaution: boolean;
  }[];
  evaluatorByTargetBand: readonly {
    evaluationStatus: string;
    failureReason: string | null;
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReached: number;
    targetReachRate: number | null;
  }[];
  pathByTargetBand: readonly {
    pathOutcome: string;
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
  }[];
  theoreticalRByBand: readonly {
    targetDistanceBand: TargetDistanceBandId;
    rEligibleDecisive: number;
    sumR: number;
    expectancyR: number | null;
    avgWinR: number | null;
    avgLossR: number | null;
    profitFactorR: number | null;
    note: string;
  }[];
  balanceAnalysis: readonly BalanceAnalysisRow[];
  thresholdAggregateViews: readonly {
    thresholdLabel: string;
    trades: number;
    targetReachRate: number | null;
    costCoverageRateAt0_20: number | null;
  }[];
  largeTargetAnalysis: readonly {
    rewardThresholdPercent: number;
    trades: number;
    targetReached: number;
    targetReachRate: number | null;
    medianBarsToTarget: number | null;
    meanMfe: number | null;
    costCoverageRateAt0_20: number | null;
    b12wReachParity: boolean;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  smallTargetAnalysis: readonly {
    thresholdLabel: string;
    trades: number;
    targetReachRate: number | null;
    costCoverageRateAt0_20: number | null;
    meanNetMarginOnReachedAt0_20: number | null;
    expectancyR: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
  }[];
  failedFavorableByBand: readonly {
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReached: number;
    costCoverageRateAt0_20: number | null;
    meanHeadroom: number | null;
    meanDisplacement: number | null;
  }[];
  passedAdverseByBand: readonly {
    targetDistanceBand: TargetDistanceBandId;
    trades: number;
    targetReached: number;
    costCoverageRateAt0_20: number | null;
    meanMfe: number | null;
    medianBarsToTarget: number | null;
  }[];
  directVsAssociational: {
    direct: readonly string[];
    associational: readonly string[];
  };
  diagnosticSummary: readonly {
    question: string;
    answer: string;
    classification: "OBSERVATIONAL";
  }[];
  tradeExamples: readonly BalanceTradeExample[];
  warnings: readonly string[];
  consumedReports: {
    lifecycleReport: true;
    reachabilityReplayReport: true;
    costAwareCounterfactualAnalysisReport: true;
    eligibilityAuditReport: true;
    structuralContextAnalysisReport: boolean;
    entryPriceMoveQualityAnalysisReport: boolean;
    displacementEqualityTargetMechanicsAnalysisReport: boolean;
    structuralExtremeVsDisplacementTargetAnalysisReport: boolean;
    alternativeTargetModelAnalysisReport: boolean;
  };
}
