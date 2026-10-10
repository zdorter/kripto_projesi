import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { TargetMagnitudeRewardBucketId } from "./historical-target-provenance-structural-distance-analysis-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

export const HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const ALTERNATIVE_TARGET_MODEL_IDS = [
  "CANONICAL_DISPLACEMENT_EQUALITY",
  "STRUCTURAL_PREFIX_EXTREME",
  "DISPLACEMENT_1_25",
  "DISPLACEMENT_1_50",
  "DISPLACEMENT_2_00",
  "DISPLACEMENT_2_50",
  "DISPLACEMENT_3_00",
  "STRUCTURAL_EXTENSION_1_00",
  "STRUCTURAL_EXTENSION_1_25",
  "STRUCTURAL_EXTENSION_1_50",
  "STRUCTURAL_EXTENSION_2_00",
] as const;

export type AlternativeTargetModelId = (typeof ALTERNATIVE_TARGET_MODEL_IDS)[number];

export type CounterfactualGeometryStatus =
  | "VALID_GEOMETRY"
  | "INVALID_GEOMETRY"
  | "NOT_CLASSIFIABLE";

export type CounterfactualRiskStatus =
  | "VALID_RISK"
  | "INVALID_RISK_REFERENCE"
  | "NOT_CLASSIFIABLE";

export type AlternativeTargetReachabilityStatus = "NOT_MEASURABLE";

export interface BuildHistoricalAlternativeTargetModelAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  artifactMeasurements: readonly HistoricalMeasurementArtifactEntry[];
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
}

export interface CounterfactualTargetModelResult {
  modelId: AlternativeTargetModelId;
  classifiable: boolean;
  unclassifiableReason: string | null;
  geometryStatus: CounterfactualGeometryStatus;
  riskStatus: CounterfactualRiskStatus;
  counterfactualTargetPrice: number | null;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  counterfactualTargetRr: number | null;
  rewardBucket: TargetMagnitudeRewardBucketId;
  rrBucket: HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE";
  targetDistanceRatioVsCanonical: number | null;
  alternativeRewardVsCanonicalPercentage: number | null;
  targetExpansionVsCanonical: number | null;
  prefixStructuralHeadroomPercentage: number | null;
  reachability: {
    status: AlternativeTargetReachabilityStatus;
    reason: string;
  };
  pathOutcomeComparability: {
    canonicalPathOutcome: ProspectiveSetupOutcomeReplayStatus;
    policyClassification: HistoricalPositionPolicyClassification;
    alternativeOutcomeInference: "NOT_INFERRED";
    note: string;
  };
  canonicalTheoreticalR: number | null;
  alternativeTheoreticalR: null;
}

export interface AlternativeTargetTradeRow {
  tradeId: string;
  snapshotId: string;
  direction: string;
  entryPrice: number | null;
  anchorPrice: number | null;
  canonicalTargetPrice: number | null;
  invalidationPrice: number | null;
  canonicalRewardPercentage: number | null;
  canonicalRrRatio: number | null;
  tradeEvaluationStatus: string;
  evaluatorFirstFailure: string | null;
  setupFamilyId: string;
  waveLabel: string;
  anchorSources: readonly OpenStructuralLegAnchorSource[];
  models: readonly CounterfactualTargetModelResult[];
}

export interface ModelAggregateMetrics {
  modelId: AlternativeTargetModelId;
  classifiableTrades: number;
  invalidGeometry: number;
  invalidRisk: number;
  meanRewardPercentage: number | null;
  meanRiskPercentage: number | null;
  meanCounterfactualRr: number | null;
  meanTargetDistanceRatioVsCanonical: number | null;
  rewardBucketCounts: Partial<Record<TargetMagnitudeRewardBucketId, number>>;
  rrBucketCounts: Partial<Record<HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE", number>>;
  largeTargetCounts: {
    gte1Percent: number;
    gte2Percent: number;
    gte3Percent: number;
    gte5Percent: number;
    gte10Percent: number;
  };
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface HistoricalAlternativeTargetModelAnalysisReport {
  schemaVersion: typeof HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION;
  datasetReference: {
    fixturePath: string;
    expectedDatasetChecksum: string;
  };
  population: {
    independentTrades: number;
    artifactJoinHits: number;
    lifecycleSummary: IndependentTradeLifecycleReport["summary"];
  };
  canonicalModel: {
    formula: string;
    sourceFunction: string;
  };
  alternativeModels: readonly {
    modelId: AlternativeTargetModelId;
    description: string;
  }[];
  modelComparison: readonly ModelAggregateMetrics[];
  modelDistributions: {
    byModel: readonly ModelAggregateMetrics[];
  };
  rewardMagnitudeComparison: readonly {
    modelId: AlternativeTargetModelId;
    byBucket: Partial<Record<TargetMagnitudeRewardBucketId, number>>;
  }[];
  riskMagnitudeComparison: readonly {
    modelId: AlternativeTargetModelId;
    meanRiskPercentage: number | null;
  }[];
  rrComparison: readonly {
    modelId: AlternativeTargetModelId;
    byRrBucket: Partial<Record<HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE", number>>;
  }[];
  structuralHeadroomComparison: readonly {
    canonicalRewardThresholdPercent: number;
    headroomThresholdPercent: number;
    trades: number;
    byModelMeanReward: Partial<Record<AlternativeTargetModelId, number | null>>;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  evaluatorCross: readonly {
    evaluationStatus: TradeEvaluationStatus | string;
    modelId: AlternativeTargetModelId;
    classifiableTrades: number;
    meanRewardPercentage: number | null;
    sampleSizeQuality: IndependentTradeSampleSizeQuality;
    interpretWithCaution: boolean;
  }[];
  failedFavorableAnalysis: {
    trades: number;
    rrBelowMinimum: number;
    byModel: readonly {
      modelId: AlternativeTargetModelId;
      classifiable: number;
      meanRewardPercentage: number | null;
      meanCounterfactualRr: number | null;
    }[];
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    byModel: readonly {
      modelId: AlternativeTargetModelId;
      classifiable: number;
      meanRewardPercentage: number | null;
    }[];
    note: string;
  };
  directionCross: readonly {
    direction: string;
    modelId: AlternativeTargetModelId;
    classifiableTrades: number;
    meanRewardPercentage: number | null;
  }[];
  setupFamilyCross: readonly {
    setupFamilyId: string;
    modelId: AlternativeTargetModelId;
    classifiableTrades: number;
  }[];
  waveContextCross: readonly {
    waveLabel: string;
    modelId: AlternativeTargetModelId;
    classifiableTrades: number;
  }[];
  anchorSourceCross: readonly {
    anchorSource: OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED";
    modelId: AlternativeTargetModelId;
    classifiableTrades: number;
    meanDisplacementMagnitude: number | null;
  }[];
  largeTargetContext: readonly {
    modelId: AlternativeTargetModelId;
    gte1: number;
    gte2: number;
    gte3: number;
    gte5: number;
    gte10: number;
    reachabilityNote: string;
  }[];
  reachability: {
    globalStatus: AlternativeTargetReachabilityStatus;
    reason: string;
    canonicalPathOutcomeMeasured: true;
    alternativeTargetTouchMeasured: false;
  };
  parity: {
    b12uPrefixBeyondCanonicalTargetCount: number;
    canonicalDisplacementMultiplier1ParityTrades: number;
    note: string;
  };
  perTrade: readonly AlternativeTargetTradeRow[];
  warnings: readonly string[];
  diagnosticSummary: readonly { question: string; answer: string }[];
  lookaheadAttestation: {
    prefixInformationSetOnly: true;
    noPathReplay: true;
    statement: string;
  };
}
