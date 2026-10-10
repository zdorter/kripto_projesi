import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

export const HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const TARGET_MAGNITUDE_REWARD_BUCKET_CONTRACT_VERSION = "1.0" as const;

export const TARGET_MAGNITUDE_REWARD_BUCKET_IDS = [
  "REWARD_LT_0_10",
  "REWARD_0_10_TO_0_25",
  "REWARD_0_25_TO_0_50",
  "REWARD_0_50_TO_1_00",
  "REWARD_1_00_TO_2_00",
  "REWARD_2_00_TO_3_00",
  "REWARD_3_00_TO_5_00",
  "REWARD_5_00_TO_10_00",
  "REWARD_GTE_10_00",
  "REWARD_NOT_APPLICABLE",
] as const;

export type TargetMagnitudeRewardBucketId =
  (typeof TARGET_MAGNITUDE_REWARD_BUCKET_IDS)[number];

export const TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT = {
  lt0_10MaxExclusive: 0.1,
  to0_25MaxExclusive: 0.25,
  to0_50MaxExclusive: 0.5,
  to1_00MaxExclusive: 1.0,
  to2_00MaxExclusive: 2.0,
  to3_00MaxExclusive: 3.0,
  to5_00MaxExclusive: 5.0,
  to10_00MaxExclusive: 10.0,
} as const;

export type TargetProvenanceCategory =
  | "WAVE_REFERENCE"
  | "FIBONACCI_RETRACEMENT_REFERENCE"
  | "FIBONACCI_EXTENSION_REFERENCE"
  | "PREVIOUS_SWING_REFERENCE"
  | "STRUCTURAL_LEVEL_REFERENCE"
  | "UNKNOWN_REFERENCE"
  | "UNAVAILABLE";

export type TargetProvenanceEvidenceLevel =
  | "DIRECT"
  | "DERIVED"
  | "INFERRED"
  | "UNKNOWN";

export interface TargetProvenanceClassificationRecord {
  category: TargetProvenanceCategory;
  sourceField: string | null;
  sourceModule: string | null;
  sourceFunction: string | null;
  evidenceLevel: TargetProvenanceEvidenceLevel;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  note: string;
}

export interface CanonicalSourceAuditLine {
  field: string;
  frozenSource: string;
  sourceModule: string;
  sourceFunction: string | null;
  evidenceLevel: TargetProvenanceEvidenceLevel;
}

export interface TargetProvenanceTradeRow {
  tradeId: string;
  snapshotId: string;
  evaluationBarIndex: number;
  primaryProvenance: TargetProvenanceClassificationRecord;
  supplementary: readonly TargetProvenanceClassificationRecord[];
  targetModelId: string | null;
  targetPolicyId: string | null;
}

export interface TargetMagnitudeBucketMetrics {
  trades: number;
  measured: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  averageRewardPercentage: number | null;
  averageRiskPercentage: number | null;
  averageCanonicalRR: number | null;
  averageTheoreticalR: number | null;
  theoreticalRTradeCount: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export type TargetMagnitudeRewardBucketTable = {
  [K in TargetMagnitudeRewardBucketId]: TargetMagnitudeBucketMetrics;
};

export interface StructuralDistanceTradeRow {
  tradeId: string;
  canonicalRewardPercentage: number | null;
  canonicalRiskPercentage: number | null;
  structuralRewardPercentage: number | null;
  structuralRewardSource: string | null;
  structuralRewardUnavailableReason: string | null;
  targetCompressionPercentage: number | null;
  entryToAnchorDistancePercentage: number | null;
  anchorPrice: number | null;
  observedHigh: number | null;
  observedLow: number | null;
}

export interface WaveContextSlice {
  waveLabel: string;
  setupFamilyId: string;
  productionStatus: string | null;
  trades: number;
  averageRewardPercentage: number | null;
  decisiveWinRate: HistoricalPositionOutcomeStatisticRate;
}

export interface FibonacciContextSummary {
  fibonacciProvenanceEstablished: false;
  note: string;
  entryFibRelation: "UNAVAILABLE";
  targetFibRelation: "UNAVAILABLE";
  fibReferenceType: "UNAVAILABLE";
}

export interface TargetProvenanceMagnitudeRow {
  provenanceCategory: TargetProvenanceCategory;
  trades: number;
  averageRewardPercentage: number | null;
  medianRewardPercentage: number | null;
  decisiveWinRate: HistoricalPositionOutcomeStatisticRate;
  interpretWithCaution: boolean;
}

export interface RewardDurationCrossCell {
  durationBucket: IndependentTradeDurationBucketId;
  rewardBucket: TargetMagnitudeRewardBucketId;
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
}

export interface RewardEvaluatorCrossCell {
  rewardBucket: TargetMagnitudeRewardBucketId;
  evaluationStatus: TradeEvaluationStatus;
  trades: number;
  decisive: number;
  failedWinCount: number;
}

export interface RewardDirectionCrossCell {
  rewardBucket: TargetMagnitudeRewardBucketId;
  direction: string;
  trades: number;
  decisive: number;
}

export interface RewardFailureReasonCrossCell {
  rewardBucket: TargetMagnitudeRewardBucketId;
  failureReason: string;
  trades: number;
  decisive: number;
  failedWinCount: number;
}

export interface LargeMoveExampleRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string | null;
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRR: number | null;
  waveContext: string;
  setupFamilyId: string;
  targetProvenanceCategory: TargetProvenanceCategory;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  tradeEvaluationStatus: TradeEvaluationStatus;
  evaluatorFirstFailure: TradeEvaluationFirstFailureCode | null;
  theoreticalR: number | null;
}

export interface CanonicalVsStructuralSummary {
  tradesWithStructuralAlternative: number;
  tradesWithCompression: number;
  averageCompressionPercentage: number | null;
  medianCompressionPercentage: number | null;
  note: string;
}

export interface BuildHistoricalTargetProvenanceStructuralDistanceAnalysisInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  eligibilityAuditReport: import("./historical-independent-trade-r-eligibility-audit-types").HistoricalIndependentTradeREligibilityAuditReport;
  rrThresholdTheoreticalRAnalysisReport?: import("./historical-evaluator-rr-threshold-theoretical-r-analysis-types").HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport;
  historicalEvaluatorFailureReasonAnalysisReport?: import("./historical-evaluator-failure-reason-analysis-types").HistoricalEvaluatorFailureReasonAnalysisReport;
  /**
   * Frozen B-8 measurements for snapshot join (read-only). Required for per-trade
   * target model / open-leg structural fields; magnitude metrics still work from lifecycle alone.
   */
  artifactMeasurements?: readonly import("./setup/historical-measurement-artifact-types").HistoricalMeasurementArtifactEntry[];
}

export interface HistoricalTargetProvenanceStructuralDistanceAnalysisReport {
  schemaVersion: typeof HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION;
  population: {
    independentTrades: number;
    artifactJoinHits: number;
    artifactJoinMisses: number;
  };
  targetProvenance: {
    canonicalSourceAudit: readonly CanonicalSourceAuditLine[];
    populationPrimaryCategory: TargetProvenanceCategory;
    perTrade: readonly TargetProvenanceTradeRow[];
    fibonacciProvenanceNote: string;
  };
  rewardMagnitude: {
    contractVersion: typeof TARGET_MAGNITUDE_REWARD_BUCKET_CONTRACT_VERSION;
    thresholdsPercent: typeof TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT;
    byBucket: TargetMagnitudeRewardBucketTable;
  };
  riskMagnitude: {
    note: string;
    averageRiskPercentage: number | null;
    medianRiskPercentage: number | null;
  };
  structuralDistance: {
    rows: readonly StructuralDistanceTradeRow[];
    canonicalVsStructural: CanonicalVsStructuralSummary;
  };
  waveContext: readonly WaveContextSlice[];
  fibonacciContext: FibonacciContextSummary;
  targetProvenanceByMagnitude: readonly TargetProvenanceMagnitudeRow[];
  rewardByDuration: readonly RewardDurationCrossCell[];
  rewardByEvaluator: readonly RewardEvaluatorCrossCell[];
  rewardByDirection: readonly RewardDirectionCrossCell[];
  rewardByFailureReason: readonly RewardFailureReasonCrossCell[];
  rewardByProspectiveRr: readonly {
    prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
    rewardBucket: TargetMagnitudeRewardBucketId;
    trades: number;
    averageRewardPercentage: number | null;
    averageRiskPercentage: number | null;
  }[];
  largeMoveExamples: {
    gte3Percent: readonly LargeMoveExampleRow[];
    gte5Percent: readonly LargeMoveExampleRow[];
    gte10Percent: readonly LargeMoveExampleRow[];
    emptyBucketNotes: readonly string[];
  };
  canonicalVsStructuralAnalysis: {
    structuralReferenceQuestion: string;
    answer: string;
    tradesWithMeasurableStructuralAlternative: number;
  };
  diagnosticSummary: readonly string[];
  warnings: readonly string[];
  lookaheadAttestation: {
    noFutureBarReferenceSynthesis: true;
    detail: string;
  };
  consumedReports: {
    lifecycleSchemaVersion: string;
    eligibilityAuditSchemaVersion: string;
    b12pSchemaVersion: string | null;
    failureReasonSchemaVersion: string | null;
  };
}
