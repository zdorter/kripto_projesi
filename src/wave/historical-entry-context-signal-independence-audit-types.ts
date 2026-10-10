import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalEntryContextCombinationFutureMoveAnalysisReport } from "./historical-entry-context-combination-future-move-analysis-types";
import type { HistoricalEntryContextFutureMoveAnalysisReport } from "./historical-entry-context-future-move-analysis-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";

export const HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION = "1.0" as const;

export const AUDIT_CONTROL_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5] as const;

export type PredictiveValidityClass =
  | "DIRECT_GEOMETRIC_RELATION"
  | "ASSOCIATIONAL"
  | "POSSIBLY_REDUNDANT"
  | "POSSIBLY_REDUNDANT_GEOMETRY"
  | "INSUFFICIENT_SAMPLE"
  | "NOT_ESTABLISHED";

export type ContextAvailabilityClass =
  | "AVAILABLE_AT_ENTRY"
  | "NOT_AVAILABLE_AT_ENTRY"
  | "LOOKAHEAD_RISK";

export type CrossThresholdRobustnessClass =
  | "UNSTABLE"
  | "MORE_STABLE_HISTORICAL_ASSOCIATION"
  | "INSUFFICIENT_SAMPLE";

export interface BuildHistoricalEntryContextSignalIndependenceAuditInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  futureMoveAnalysisReport: HistoricalEntryContextFutureMoveAnalysisReport;
  entryContextCombinationFutureMoveAnalysisReport: HistoricalEntryContextCombinationFutureMoveAnalysisReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
}

export interface DependencyMatrixRow {
  contextA: string;
  contextB: string;
  pearsonCorrelation: number | null;
  spearmanRankCorrelation: number | null;
  crossTabMaxBucketShare: number | null;
  note: string;
  validityClass: PredictiveValidityClass;
}

export interface ControlSliceMetrics {
  sliceLabel: string;
  trades: number;
  classifiable: number;
  reachRates: readonly {
    thresholdPercent: number;
    reachRate: number | null;
    wilson95: IndependentTradeWinRateConfidenceInterval;
  }[];
  meanMfe: number | null;
  medianMfe: number | null;
  meanMae: number | null;
  medianMae: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  validityClass: PredictiveValidityClass;
}

export interface SameBandControlRow {
  rewardBand: string;
  comparisonLabel: string;
  sliceA: ControlSliceMetrics;
  sliceB: ControlSliceMetrics;
  reach2DeltaPercentagePoints: number | null;
  note: string;
}

export interface FeatureIndependenceSummaryRow {
  context: string;
  futureAssociationObserved: boolean;
  geometryDependency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  independentInformationStatus: PredictiveValidityClass;
  entryAvailability: ContextAvailabilityClass;
}

export interface HistoricalEntryContextSignalIndependenceAuditReport {
  schemaVersion: typeof HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    classifiableForFutureMove: number;
    horizonBars: number;
  };
  contextAvailability: readonly {
    context: string;
    availability: ContextAvailabilityClass;
    note: string;
  }[];
  dependencyMatrix: readonly DependencyMatrixRow[];
  geometricRedundancyAnalysis: {
    displacementRewardPearson: number | null;
    displacementRewardSpearman: number | null;
    equalityMechanicsNote: string;
    validityClass: PredictiveValidityClass;
    warning: string;
  };
  headroomIndependenceAnalysis: {
    headroomPresentReach2: number | null;
    headroomAbsentReach2: number | null;
    sameDisplacementControlDeltaPp: number | null;
    prefixVsFutureNote: string;
    validityClass: PredictiveValidityClass;
  };
  controlSlices: readonly ControlSliceMetrics[];
  sameTargetControls: readonly SameBandControlRow[];
  sameDisplacementControls: readonly SameBandControlRow[];
  rrDependencyAnalysis: {
    rrRewardPearson: number | null;
    rrDisplacementPearson: number | null;
    rrRiskPearson: number | null;
    note: string;
    validityClass: PredictiveValidityClass;
  };
  structuralExtremeAnalysis: {
    structuralMoveHeadroomPearson: number | null;
    structuralMoveMfePearson: number | null;
    prefixContextNote: string;
    validityClass: PredictiveValidityClass;
  };
  mfeWithoutTouchAnalysis: {
    trades: number;
    meanDisplacement: number | null;
    meanHeadroomPct: number | null;
    meanReward: number | null;
    meanRr: number | null;
    note: string;
  };
  failedFavorableAnalysis: {
    trades: number;
    controlSlices: readonly ControlSliceMetrics[];
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    controlSlices: readonly ControlSliceMetrics[];
    note: string;
  };
  crossThresholdRobustness: readonly {
    associationLabel: string;
    thresholdProfile: readonly { thresholdPercent: number; reachRate: number | null }[];
    robustness: CrossThresholdRobustnessClass;
  }[];
  temporalDescriptiveSplit: {
    label: "TEMPORAL_DESCRIPTIVE_SPLIT";
    earlierFraction: number;
    earlier: {
      classifiable: number;
      reach1: number | null;
      reach2: number | null;
      reach3: number | null;
      headroomPresentReach2: number | null;
    };
    later: {
      classifiable: number;
      reach1: number | null;
      reach2: number | null;
      reach3: number | null;
      headroomPresentReach2: number | null;
    };
    note: string;
  };
  featureIndependenceSummary: readonly FeatureIndependenceSummaryRow[];
  theoreticalRReference: {
    consumed: boolean;
    label: "THEORETICAL_R_REFERENCE";
    sumTheoreticalR: number | null;
  };
  costReference: {
    consumed: boolean;
    roundTripPercentage: number | null;
    note: string;
  };
  multipleComparisonWarning: {
    cellsExamined: number;
    selectionBiasNote: string;
  };
  diagnosticSummary: readonly { question: string; answer: string; tag: ResearchConclusionTag }[];
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: {
    prefixContextEnd: "E";
    postEOutcomeStart: "E+1";
    statement: string;
  };
  parity: {
    b14ThresholdReachCountsMatch: boolean;
    b16B14ParityMatch: boolean;
    note: string;
  };
  warnings: readonly string[];
  tradeExamples: readonly { tradeId: string; note: string }[];
  consumedReports: Record<string, boolean>;
}
