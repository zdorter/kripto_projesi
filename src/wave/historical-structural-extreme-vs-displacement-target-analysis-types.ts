import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";

export const HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const STRUCTURAL_HEADROOM_BUCKET_IDS = [
  "NO_HEADROOM",
  "HEADROOM_LT_0_25",
  "HEADROOM_0_25_TO_0_50",
  "HEADROOM_0_50_TO_1_00",
  "HEADROOM_1_00_TO_2_00",
  "HEADROOM_2_00_TO_3_00",
  "HEADROOM_3_00_TO_5_00",
  "HEADROOM_5_00_TO_10_00",
  "HEADROOM_GTE_10_00",
  "HEADROOM_NOT_APPLICABLE",
] as const;

export type StructuralHeadroomBucketId =
  (typeof STRUCTURAL_HEADROOM_BUCKET_IDS)[number];

export const STRUCTURAL_MOVE_BUCKET_IDS = [
  "STRUCTURAL_LT_0_5",
  "STRUCTURAL_0_5_TO_1",
  "STRUCTURAL_1_TO_2",
  "STRUCTURAL_2_TO_3",
  "STRUCTURAL_3_TO_5",
  "STRUCTURAL_5_TO_10",
  "STRUCTURAL_GTE_10",
  "STRUCTURAL_NOT_APPLICABLE",
] as const;

export type StructuralMoveBucketId = (typeof STRUCTURAL_MOVE_BUCKET_IDS)[number];

export type StructuralReferenceKind = "PREFIX_EXTREME" | "SCENARIO_ENDPOINT";

export type StructuralGeometryUnavailableReason =
  | "OPEN_LEG_UNAVAILABLE"
  | "INVALID_ENTRY"
  | "INVALID_DIRECTION"
  | "INVALID_TARGET"
  | "INVALID_EXTREME"
  | "NON_FINITE"
  | "NO_PREFIX_EXTREME_BEYOND_ENTRY"
  | "SCENARIO_ENDPOINT_UNAVAILABLE"
  | "CANONICAL_REWARD_UNAVAILABLE";

export interface BuildHistoricalStructuralExtremeVsDisplacementTargetAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  artifactMeasurements: readonly HistoricalMeasurementArtifactEntry[];
}

export interface StructuralExtremeTradeRow {
  tradeId: string;
  snapshotId: string;
  direction: string;
  entryPrice: number | null;
  targetPrice: number | null;
  prefixExtremePrice: number | null;
  scenarioEndpointPrice: number | null;
  canonicalRewardPercentage: number | null;
  prefixStructuralMovePercentage: number | null;
  scenarioStructuralMovePercentage: number | null;
  prefixExtremeHeadroomPercentage: number | null;
  scenarioEndpointHeadroomPercentage: number | null;
  prefixStructuralToCanonicalRatio: number | null;
  scenarioStructuralToCanonicalRatio: number | null;
  prefixTargetCompressionPercentage: number | null;
  scenarioTargetCompressionPercentage: number | null;
  prefixHeadroomBucket: StructuralHeadroomBucketId;
  prefixStructuralMoveBucket: StructuralMoveBucketId;
  unavailableReason: StructuralGeometryUnavailableReason | null;
  waveLabel: string;
  setupFamilyId: string;
  anchorSources: readonly OpenStructuralLegAnchorSource[];
}

export interface SliceMetrics {
  trades: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  meanPrefixHeadroomPercentage: number | null;
  meanPrefixStructuralMovePercentage: number | null;
  prefixBeyondCanonicalTargetCount: number;
}

export interface HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport {
  schemaVersion: typeof HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION;
  datasetReference: {
    fixturePath: string;
    expectedDatasetChecksum: string;
    note: string;
  };
  population: {
    independentTrades: number;
    artifactJoinHits: number;
    artifactJoinMisses: number;
    artifactMeasurementEntries: number;
  };
  canonicalReference: {
    targetPolicy: string;
    targetSourceFunction: string;
    geometryNote: string;
  };
  prefixExtremeAnalysis: {
    tradesWithHeadroomBeyondCanonicalTarget: number;
    fractionWithHeadroom: number | null;
    perTrade: readonly Pick<
      StructuralExtremeTradeRow,
      | "tradeId"
      | "prefixExtremeHeadroomPercentage"
      | "prefixStructuralMovePercentage"
      | "prefixStructuralToCanonicalRatio"
      | "prefixTargetCompressionPercentage"
      | "prefixHeadroomBucket"
      | "prefixStructuralMoveBucket"
    >[];
  };
  scenarioEndpointAnalysis: {
    tradesWithScenarioEndpoint: number;
    tradesWithHeadroomBeyondCanonicalTarget: number;
    note: string;
  };
  headroomDistribution: Record<StructuralHeadroomBucketId, number>;
  structuralMoveDistribution: Record<StructuralMoveBucketId, number>;
  compressionDistribution: {
    tradesWithPrefixCompression: number;
    tradesWithScenarioCompression: number;
    meanPrefixCompressionPercentage: number | null;
  };
  waveContext: readonly {
    waveLabel: string;
    setupFamilyId: string;
    trades: number;
    prefixBeyondCanonicalTargetCount: number;
    meanPrefixHeadroomPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  anchorSourceAnalysis: readonly {
    anchorSource: OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED";
    trades: number;
    prefixBeyondCanonicalTargetCount: number;
    meanPrefixHeadroomPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  evaluatorCross: readonly {
    evaluationStatus: TradeEvaluationStatus;
    trades: number;
    prefixBeyondCanonicalTargetCount: number;
    meanPrefixHeadroomPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  evaluatorFailureCross: readonly {
    evaluationStatus: TradeEvaluationStatus;
    firstFailure: TradeEvaluationFirstFailureCode | "NONE";
    policyClassification: HistoricalPositionPolicyClassification;
    trades: number;
    meanPrefixHeadroomPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  outcomeCross: readonly {
    policyClassification: HistoricalPositionPolicyClassification;
    pathOutcome: ProspectiveSetupOutcomeReplayStatus;
    trades: number;
    prefixBeyondCanonicalTargetCount: number;
    meanPrefixHeadroomPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  rrCross: readonly {
    rrBucket: HistoricalMeasurementRRBucketRow;
    trades: number;
    prefixBeyondCanonicalTargetCount: number;
    meanPrefixHeadroomPercentage: number | null;
    meanPrefixStructuralMovePercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  rewardHeadroomCross: readonly {
    rewardThresholdPercent: number;
    headroomThresholdPercent: number;
    trades: number;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  largeMoveContext: {
    structuralMoveGte3: SliceMetrics & { canonicalRewardMean: number | null };
    structuralMoveGte5: SliceMetrics & { canonicalRewardMean: number | null };
    structuralMoveGte10: SliceMetrics & { canonicalRewardMean: number | null };
    note: string;
  };
  structuralBeyondCanonicalSummary: {
    prefixExtremeBeyondCanonicalTargetCount: number;
    prefixExtremeBeyondCanonicalTargetFraction: number | null;
    meanPrefixHeadroomWhenBeyond: number | null;
    medianPrefixHeadroomWhenBeyond: number | null;
  };
  parity: {
    b12sStructuralMoveBeyondCanonicalRewardCount: number;
    b12sParityMatch: boolean;
    semanticNote: string;
  };
  perTrade: readonly StructuralExtremeTradeRow[];
  warnings: readonly string[];
  diagnosticSummary: readonly { finding: string; observationalNote: string }[];
  lookaheadAttestation: {
    prefixInformationSetOnly: true;
    noFutureBarReferenceSynthesis: true;
    statement: string;
  };
}
