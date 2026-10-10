import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalEvaluatorFailureReasonAnalysisReport } from "./historical-evaluator-failure-reason-analysis-types";
import type { HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { StructuralHeadroomBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalTargetDistanceStructuralContextAnalysisReport } from "./historical-target-distance-structural-context-analysis-types";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type {
  IndependentTradeSampleSizeQuality,
} from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";

export const HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION = "1.0" as const;

export type ResearchConclusionTag =
  | "DIRECT_OBSERVATION"
  | "ASSOCIATIONAL_FINDING"
  | "INSUFFICIENT_SAMPLE"
  | "NOT_ESTABLISHED"
  | "NEXT_PHASE_CANDIDATE";

export type SameTargetBandHeadroomTier =
  | "NO_HEADROOM"
  | "SMALL_HEADROOM"
  | "MEDIUM_HEADROOM"
  | "LARGE_HEADROOM";

export type HeadroomPresence = "HEADROOM_PRESENT" | "HEADROOM_ABSENT";

export type AnchorSourceDimension =
  | OpenStructuralLegAnchorSource
  | "MIXED"
  | "UNKNOWN";

export interface BuildHistoricalEntryContextTargetResearchInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  artifactMeasurements: readonly HistoricalMeasurementArtifactEntry[];
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport: HistoricalCostAwareCounterfactualAnalysisReport;
  eligibilityAuditReport: HistoricalIndependentTradeREligibilityAuditReport;
  historicalEvaluatorFailureReasonAnalysisReport?: HistoricalEvaluatorFailureReasonAnalysisReport;
  rrThresholdTheoreticalRAnalysisReport?: HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport;
  historicalTargetDistanceStructuralContextAnalysisReport?: HistoricalTargetDistanceStructuralContextAnalysisReport;
  historicalStructuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  historicalDisplacementEqualityTargetMechanicsAnalysisReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
}

export interface ContextSliceMetrics {
  trades: number;
  decisive: number;
  classifiable: number;
  targetReached: number;
  targetReachRate: number | null;
  reachRateWilson95: IndependentTradeWinRateConfidenceInterval;
  targetBeforeInvalidationRate: number | null;
  medianBarsToTarget: number | null;
  meanMfe: number | null;
  medianMfe: number | null;
  mfeToTargetRatio: number | null;
  meanCanonicalTargetPercent: number | null;
  costCoverageRateAt0_20: number | null;
  expectancyR: number | null;
  sumR: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface EntryContextTargetBandRow extends ContextSliceMetrics {
  entryContextLabel: string;
  targetBand: PriceMoveRewardBucketId;
}

export interface HeadroomTargetRow extends ContextSliceMetrics {
  headroomBucket: StructuralHeadroomBucketId | "POSITIVE_HEADROOM" | "NO_HEADROOM";
  targetBand: PriceMoveRewardBucketId;
}

export interface DisplacementTargetRow extends ContextSliceMetrics {
  displacementBucket: DisplacementContextBucketId;
  targetBand: PriceMoveRewardBucketId;
}

export interface SameTargetBandSegmentRow extends ContextSliceMetrics {
  targetBand: PriceMoveRewardBucketId;
  headroomTier: SameTargetBandHeadroomTier;
}

export interface HistoricalEntryContextTargetResearchReport {
  schemaVersion: typeof HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION;
  datasetReference: {
    fixturePath: string;
    expectedDatasetChecksum: string;
  };
  population: {
    independentTrades: number;
    totalSnapshots: number | null;
    eligibleEntrySnapshots: number | null;
    canonicalReplayClassifiable: number;
    canonicalNotReplayable: number;
  };
  lookaheadAttestation: {
    entryContextUsesAnchorToEOnly: true;
    postEUsedForOutcomesOnly: true;
    statement: string;
  };
  entryContextDimensions: readonly string[];
  displacementAnalysis: readonly (ContextSliceMetrics & {
    displacementBucket: DisplacementContextBucketId;
  })[];
  headroomAnalysis: readonly (ContextSliceMetrics & {
    headroomBucket: StructuralHeadroomBucketId;
  })[];
  headroomPresenceComparison: {
    noHeadroom: ContextSliceMetrics;
    positiveHeadroom: ContextSliceMetrics;
  };
  sameTargetBandSegmentation: readonly SameTargetBandSegmentRow[];
  headroomGeTargetCohort: {
    headroomGeTarget: ContextSliceMetrics;
    headroomLtTarget: ContextSliceMetrics;
    note: string;
  };
  mfeNotReachedAnalysis: {
    groupA_targetNotReached_mfeLtTarget: ContextSliceMetrics;
    groupB_targetNotReached_mfeGteTarget: ContextSliceMetrics;
    note: string;
  };
  targetHeadroomMfeCross: readonly {
    targetBand: PriceMoveRewardBucketId;
    headroomBucket: StructuralHeadroomBucketId;
    mfeToTargetTier: "MFE_LT_TARGET" | "MFE_GTE_TARGET";
    trades: number;
    targetReachRate: number | null;
    costCoverageRateAt0_20: number | null;
    interpretWithCaution: boolean;
  }[];
  displacementHeadroomCross: readonly {
    displacementBucket: DisplacementContextBucketId;
    headroomBucket: StructuralHeadroomBucketId;
    trades: number;
    meanCanonicalTargetPercent: number | null;
    targetReachRate: number | null;
    mfeToTargetRatio: number | null;
    costCoverageRateAt0_20: number | null;
  }[];
  prefixExtremeAssociation: {
    headroomPresent: ContextSliceMetrics;
    headroomAbsent: ContextSliceMetrics;
    note: string;
  };
  alternativeModelReference: readonly {
    headroomPresence: HeadroomPresence;
    modelId: AlternativeTargetModelId;
    targetReached: number;
    classifiable: number;
    targetReachRate: number | null;
  }[];
  entryContextByTargetBand: readonly EntryContextTargetBandRow[];
  headroomByTarget: readonly HeadroomTargetRow[];
  displacementByTarget: readonly DisplacementTargetRow[];
  costBaseline: {
    roundTripCostPercent: 0.2;
    note: string;
  };
  failedFavorableAnalysis: {
    trades: number;
    slice: ContextSliceMetrics;
    vsPopulationReachRate: number | null;
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    slice: ContextSliceMetrics;
    vsPopulationReachRate: number | null;
    note: string;
  };
  rrControlCross: readonly {
    rrBucket: HistoricalMeasurementRRBucketRow | "RR_LT_1_5" | "RR_GTE_1_5";
    headroomPresence: HeadroomPresence;
    trades: number;
    targetReachRate: number | null;
  }[];
  secondaryWaveDirectionFamily: {
    wave: readonly { waveLabel: string; slice: ContextSliceMetrics }[];
    direction: readonly { direction: string; slice: ContextSliceMetrics }[];
    family: readonly { setupFamilyId: string; slice: ContextSliceMetrics }[];
  };
  anchorSourceNote: string;
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  diagnosticSummary: readonly {
    question: string;
    answer: string;
    tag: ResearchConclusionTag;
  }[];
  establishedFindings: readonly { finding: string; tag: ResearchConclusionTag }[];
  notEstablishedFindings: readonly { finding: string; tag: ResearchConclusionTag }[];
  nextPhaseResearchCandidates: readonly { candidate: string; rationale: string }[];
  warnings: readonly string[];
  consumedReports: Record<string, boolean>;
}
