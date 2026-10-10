import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalEntryContextFutureMoveAnalysisReport } from "./historical-entry-context-future-move-analysis-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { AnchorSourceDimension, HeadroomPresence, ResearchConclusionTag, SameTargetBandHeadroomTier } from "./historical-entry-context-target-research-types";
import type { ProspectiveRrBucketId } from "./historical-entry-context-future-move-analysis-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";

export const HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS = [
  0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10,
] as const;

export const FUTURE_MOVE_PROFILE_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5] as const;

export const FUTURE_MOVE_CONDITIONAL_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5] as const;

export const FUTURE_MOVE_LARGE_MOVE_THRESHOLDS = [1, 2, 3, 5, 10] as const;

export type FutureMovePredictivenessContextDimensionId =
  | "DISPLACEMENT"
  | "HEADROOM_PRESENCE"
  | "HEADROOM_TIER"
  | "STRUCTURAL_MOVE"
  | "CANONICAL_REWARD"
  | "PROSPECTIVE_RR"
  | "DIRECTION"
  | "WAVE"
  | "SETUP_FAMILY"
  | "ANCHOR_SOURCE"
  | "EVALUATOR_STATUS"
  | "EVALUATOR_FAILURE";

export type TargetVsFutureMoveCategoryId =
  | "FUTURE_BELOW_TARGET"
  | "FUTURE_REACHED_TARGET"
  | "FUTURE_EXCEEDED_TARGET"
  | "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH"
  | "NOT_CLASSIFIED";

export type MonotonicityAssessment = "MONOTONIC_INCREASING" | "MONOTONIC_DECREASING" | "NOT_MONOTONIC";

export interface BuildHistoricalEntryContextFutureMovePredictivenessAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  futureMoveAnalysisReport: HistoricalEntryContextFutureMoveAnalysisReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
}

export interface FutureMoveThresholdSliceRow {
  thresholdPercent: number;
  trades: number;
  classifiable: number;
  futureMoveReachedCount: number;
  futureMoveReachRate: number | null;
  medianBarsToThreshold: number | null;
  meanFavorableMovePercentage: number | null;
  medianFavorableMovePercentage: number | null;
  meanMfe: number | null;
  medianMfe: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  deltaVsOverallPercentagePoints: number | null;
  associationTag: "DIRECT_OBSERVATION" | "DESCRIPTIVE_ASSOCIATION";
}

export interface FutureMoveContextBucketAnalysis {
  bucketId: string;
  trades: number;
  classifiable: number;
  thresholdSlices: readonly FutureMoveThresholdSliceRow[];
  multiThresholdProfile: readonly {
    thresholdPercent: number;
    futureMoveReachRate: number | null;
    futureMoveReachedCount: number;
    classifiable: number;
  }[];
  mfeMae: {
    meanMfe: number | null;
    medianMfe: number | null;
    meanMae: number | null;
    medianMae: number | null;
    meanMfeToCanonicalTargetRatio: number | null;
    medianBarsToMaxFavorableExcursion: number | null;
  };
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface FutureMoveDimensionAnalysis {
  dimensionId: FutureMovePredictivenessContextDimensionId;
  secondaryAssociational: boolean;
  orderedBucketIds: readonly string[];
  buckets: readonly FutureMoveContextBucketAnalysis[];
}

export interface HistoricalConditionalReachRow {
  contextDimension: FutureMovePredictivenessContextDimensionId;
  bucketId: string;
  thresholdPercent: number;
  classifiable: number;
  futureMoveReachedCount: number;
  historicalConditionalReachRate: number | null;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  label: "HISTORICAL_CONDITIONAL_REACH_RATE";
}

export interface FutureMoveSeparationRow {
  dimensionId: FutureMovePredictivenessContextDimensionId;
  thresholdPercent: number;
  highestBucketId: string | null;
  highestReachRate: number | null;
  lowestBucketId: string | null;
  lowestReachRate: number | null;
  spreadPercentagePoints: number | null;
  monotonicity: MonotonicityAssessment;
  orderedBucketReachRates: readonly { bucketId: string; reachRate: number | null; classifiable: number }[];
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  wilson95SpreadNote: string;
}

export interface LargeMoveContextCrossRow {
  dimensionId: FutureMovePredictivenessContextDimensionId;
  bucketId: string;
  thresholdPercent: number;
  trades: number;
  classifiable: number;
  futureMoveReachedCount: number;
  futureMoveReachRate: number | null;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface TargetVsFutureMoveClassificationRow {
  category: TargetVsFutureMoveCategoryId;
  trades: number;
  meanFavorableMove: number | null;
  medianFavorableMove: number | null;
  meanCanonicalReward: number | null;
}

export interface CohortFutureMoveProfile {
  trades: number;
  classifiable: number;
  multiThresholdProfile: readonly {
    thresholdPercent: number;
    futureMoveReachRate: number | null;
    futureMoveReachedCount: number;
  }[];
  meanMfe: number | null;
  medianMfe: number | null;
  meanMae: number | null;
  medianMae: number | null;
  meanCanonicalReward: number | null;
  meanMfeToCanonicalTargetRatio: number | null;
  note: string;
}

export interface PredictivenessTradeExample {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  displacementBucket: DisplacementContextBucketId;
  headroomPresence: HeadroomPresence;
  canonicalRewardPercentage: number | null;
  prospectiveRr: number | null;
  favorableMovePercentage: number | null;
  targetVsFutureCategory: TargetVsFutureMoveCategoryId;
  evaluatorStatus: string;
  policyClassification: string;
  note: string;
}

export interface HistoricalEntryContextFutureMovePredictivenessAnalysisReport {
  schemaVersion: typeof HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    b14PerTradeRows: number;
    classifiableForFutureMove: number;
    horizonBars: number;
  };
  thresholds: readonly number[];
  contextDimensions: readonly FutureMovePredictivenessContextDimensionId[];
  displacementAnalysis: FutureMoveDimensionAnalysis;
  headroomAnalysis: {
    presence: FutureMoveDimensionAnalysis;
    tier: FutureMoveDimensionAnalysis;
  };
  structuralMoveAnalysis: FutureMoveDimensionAnalysis;
  canonicalRewardAnalysis: FutureMoveDimensionAnalysis;
  prospectiveRrAnalysis: FutureMoveDimensionAnalysis;
  directionAnalysis: FutureMoveDimensionAnalysis;
  waveAnalysis: FutureMoveDimensionAnalysis;
  setupFamilyAnalysis: FutureMoveDimensionAnalysis;
  anchorSourceAnalysis: FutureMoveDimensionAnalysis;
  evaluatorStatusAnalysis: FutureMoveDimensionAnalysis;
  evaluatorFailureAnalysis: FutureMoveDimensionAnalysis;
  targetVsFutureMove: readonly TargetVsFutureMoveClassificationRow[];
  largeMoveAnalysis: readonly LargeMoveContextCrossRow[];
  failedFavorableAnalysis: CohortFutureMoveProfile;
  passedAdverseAnalysis: CohortFutureMoveProfile;
  separationAnalysis: readonly FutureMoveSeparationRow[];
  conditionalHistoricalReach: readonly HistoricalConditionalReachRow[];
  multiThresholdProfiles: readonly {
    dimensionId: FutureMovePredictivenessContextDimensionId;
    bucketId: string;
    profile: readonly { thresholdPercent: number; futureMoveReachRate: number | null }[];
  }[];
  mfeMaeAnalysis: readonly {
    dimensionId: FutureMovePredictivenessContextDimensionId;
    bucketId: string;
    meanMfe: number | null;
    medianMfe: number | null;
    meanMae: number | null;
    medianMae: number | null;
    meanMfeToTargetRatio: number | null;
    trades: number;
  }[];
  timeToThresholdAnalysis: readonly {
    thresholdPercent: number;
    source: string;
    medianBarsToReach: number | null;
    p25BarsToReach: number | null;
    p75BarsToReach: number | null;
    b14ParityMatch: boolean;
  }[];
  diagnosticSummary: readonly {
    question: string;
    answer: string;
    tag: ResearchConclusionTag;
  }[];
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: {
    entryContextEnd: "E";
    futureOutcomeStart: "E+1";
    statement: string;
  };
  parity: {
    b14ThresholdReachCountsMatch: boolean;
    b14PopulationClassifiable: number;
    note: string;
  };
  warnings: readonly string[];
  tradeExamples: readonly PredictivenessTradeExample[];
  consumedReports: Record<string, boolean>;
}
