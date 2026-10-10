import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalEntryContextFutureMoveAnalysisReport } from "./historical-entry-context-future-move-analysis-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";

export const HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const COMBINATION_FUTURE_MOVE_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5, 10] as const;

export const COMBINATION_STABILITY_THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5] as const;

export const COMBINATION_LARGE_MOVE_THRESHOLDS = [1, 2, 3, 5, 10] as const;

export type CombinationStabilityClass =
  | "STABLE"
  | "PARTIALLY_STABLE"
  | "UNSTABLE"
  | "INSUFFICIENT_SAMPLE";

export type ContextDimensionKey =
  | "displacement"
  | "headroom"
  | "structuralMove"
  | "canonicalReward"
  | "prospectiveRr"
  | "direction"
  | "wave"
  | "setupFamily"
  | "anchorSource"
  | "evaluatorStatus"
  | "evaluatorFailure";

export interface BuildHistoricalEntryContextCombinationFutureMoveAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  futureMoveAnalysisReport: HistoricalEntryContextFutureMoveAnalysisReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
}

export interface CombinationThresholdCell {
  thresholdPercent: number;
  trades: number;
  classifiable: number;
  futureMoveReachedCount: number;
  futureMoveReachRate: number | null;
  wilson95: IndependentTradeWinRateConfidenceInterval;
  medianBarsToThreshold: number | null;
  meanMfe: number | null;
  medianMfe: number | null;
  meanMae: number | null;
  medianMae: number | null;
  overallReachRate: number | null;
  conditionalReachRate: number | null;
  deltaVsOverallPercentagePoints: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  insufficientSample: boolean;
  label: "HISTORICAL_CONDITIONAL_REACH_RATE";
  associationTag: "DESCRIPTIVE_ASSOCIATION";
}

export interface CombinationBucketReport {
  combinationId: string;
  dimensionKeys: readonly ContextDimensionKey[];
  bucketLabel: string;
  trades: number;
  classifiable: number;
  thresholdCells: readonly CombinationThresholdCell[];
  crossThresholdProfile: readonly {
    thresholdPercent: number;
    futureMoveReachRate: number | null;
  }[];
  crossThresholdStability: CombinationStabilityClass;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  reported: boolean;
}

export interface CombinationSetReport {
  combinationSpecId: string;
  dimensions: readonly ContextDimensionKey[];
  combinationCountTested: number;
  validCombinationBuckets: number;
  insufficientSampleBuckets: number;
  buckets: readonly CombinationBucketReport[];
}

export interface CombinationSeparationRow {
  combinationSpecId: string;
  thresholdPercent: number;
  highestObservedReachCombination: string | null;
  highestObservedReachRate: number | null;
  lowestObservedReachCombination: string | null;
  lowestObservedReachRate: number | null;
  spreadPercentagePoints: number | null;
  numberOfValidCombinations: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  insufficientSample: boolean;
  note: string;
}

export interface HistoricalEntryContextCombinationFutureMoveAnalysisReport {
  schemaVersion: typeof HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    b14PerTradeRows: number;
    classifiableForFutureMove: number;
    horizonBars: number;
  };
  contextDefinitions: readonly { key: ContextDimensionKey; description: string; secondary: boolean }[];
  pairCombinations: readonly CombinationSetReport[];
  tripleCombinations: readonly CombinationSetReport[];
  conditionalHistoricalReach: readonly {
    combinationSpecId: string;
    bucketLabel: string;
    thresholdPercent: number;
    historicalConditionalReachRate: number | null;
    classifiable: number;
    label: "HISTORICAL_CONDITIONAL_REACH_RATE";
  }[];
  separationAnalysis: readonly CombinationSeparationRow[];
  crossThresholdStability: readonly {
    combinationSpecId: string;
    bucketLabel: string;
    stability: CombinationStabilityClass;
    profile: readonly { thresholdPercent: number; reachRate: number | null }[];
  }[];
  largeMoveSeparation: readonly CombinationSeparationRow[];
  targetDistanceAnalysis: readonly {
    scenarioLabel: string;
    bucketLabel: string;
    classifiable: number;
    futureMoveGte2Rate: number | null;
    note: string;
  }[];
  headroomAnalysis: CombinationSetReport;
  displacementAnalysis: CombinationSetReport;
  rrAnalysis: CombinationSetReport;
  directionAnalysis: CombinationSetReport;
  waveAnalysis: CombinationSetReport;
  setupFamilyAnalysis: CombinationSetReport;
  anchorAnalysis: CombinationSetReport;
  failedFavorableAnalysis: {
    trades: number;
    classifiable: number;
    thresholdProfile: readonly { thresholdPercent: number; reachRate: number | null }[];
    meanMfe: number | null;
    medianMfe: number | null;
    meanMae: number | null;
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    classifiable: number;
    thresholdProfile: readonly { thresholdPercent: number; reachRate: number | null }[];
    meanMfe: number | null;
    medianMfe: number | null;
    meanMae: number | null;
    note: string;
  };
  theoreticalRReference: {
    consumed: boolean;
    label: "THEORETICAL_R_REFERENCE";
    sumTheoreticalR: number | null;
    note: string;
  };
  costReference: {
    consumed: boolean;
    roundTripPercentageScenario: number | null;
    note: string;
  };
  mfeMaeAnalysis: readonly {
    combinationSpecId: string;
    bucketLabel: string;
    meanMfe: number | null;
    medianMfe: number | null;
    meanMae: number | null;
    medianMae: number | null;
    trades: number;
  }[];
  timeToThresholdAnalysis: readonly {
    thresholdPercent: number;
    source: string;
    medianBarsToReach: number | null;
    b14ParityMatch: boolean;
  }[];
  multipleComparisonWarning: {
    combinationCellsTested: number;
    validCells: number;
    insufficientCells: number;
    selectionBiasNote: string;
  };
  diagnosticSummary: readonly { question: string; answer: string; tag: ResearchConclusionTag }[];
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: {
    entryContextEnd: "E";
    futureOutcomeStart: "E+1";
    statement: string;
  };
  parity: {
    b14ThresholdReachCountsMatch: boolean;
    note: string;
  };
  warnings: readonly string[];
  tradeExamples: readonly {
    tradeId: string;
    bucketLabels: readonly string[];
    favorableMovePercentage: number | null;
    note: string;
  }[];
  consumedReports: Record<string, boolean>;
}
