import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalEntryContextCombinationFutureMoveAnalysisReport } from "./historical-entry-context-combination-future-move-analysis-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type {
  CounterfactualReplayEvent,
  HistoricalAlternativeTargetReachabilityReplayReport,
} from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEntryContextSignalIndependenceAuditReport } from "./historical-entry-context-signal-independence-audit-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { Candle } from "./types";

export const HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION = "1.0" as const;

export const ROUND_TRIP_COST_SCENARIOS = [0.1, 0.2, 0.3, 0.5] as const;

export type DelayedEntryModelId =
  | "MODEL_D_NO_DELAY_BASELINE"
  | "MODEL_A_FIXED_RETRACEMENT"
  | "MODEL_B_ANCHOR_FRACTION"
  | "MODEL_C_STRUCTURAL_RETRACEMENT";

export type DelayedEntryLifecycleStatus =
  | "ENTRY_FILLED"
  | "ENTRY_NOT_FILLED"
  | "TARGET_MOVED_BEFORE_ENTRY"
  | "INVALIDATION_MOVED_BEFORE_ENTRY"
  | "AMBIGUOUS_ENTRY_FILL"
  | "NOT_REPLAYABLE";

export type CounterfactualTargetModelId = "T1_FROZEN_TARGET" | "T2_REPROJECTED_TARGET";

export type CounterfactualInvalidationModelId = "I1_FROZEN_INVALIDATION" | "I2_RELATIVE_RISK_REFERENCE";

export type ResearchFindingTag =
  | "DIRECT_OBSERVATION"
  | "ASSOCIATIONAL_FINDING"
  | "INSUFFICIENT_SAMPLE"
  | "NOT_ESTABLISHED"
  | "COUNTERFACTUAL_ENTRY_MODEL";

export interface BuildHistoricalDelayedEntryResearchInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  candles: readonly Candle[];
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  entryContextCombinationFutureMoveAnalysisReport?: HistoricalEntryContextCombinationFutureMoveAnalysisReport;
  signalIndependenceAuditReport?: HistoricalEntryContextSignalIndependenceAuditReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  displacementEqualityPerTrade?: readonly {
    tradeId: string;
    anchorPrice: number | null;
    displacementPercentage: number | null;
  }[];
  structuralPerTrade?: readonly {
    tradeId: string;
    prefixExtremePrice: number | null;
    prefixStructuralMovePercentage: number | null;
    prefixExtremeHeadroomPercentage?: number | null;
  }[];
}

export interface EntryQualityComparisonRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  targetModel: CounterfactualTargetModelId;
  trades: number;
  fillRate: number | null;
  fillRateWilson95: IndependentTradeWinRateConfidenceInterval;
  medianImprovement: number | null;
  meanImprovement: number | null;
  medianRisk: number | null;
  medianReward: number | null;
  medianCounterfactualRr: number | null;
  targetReachRate: number | null;
  invalidationRate: number | null;
  noTouchRate: number | null;
  medianBarsToFill: number | null;
  medianBarsToTargetAfterFill: number | null;
  costCoverageAt020: number | null;
  missedEntryCount: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  tag: ResearchFindingTag;
}

export interface HistoricalDelayedEntryTradeSimResult {
  tradeId: string;
  status: DelayedEntryLifecycleStatus;
  fillBarOffset: number | null;
  delayedEntryPrice: number | null;
  improvementPct: number | null;
  riskPctI1: number | null;
  riskPctI2: number | null;
  rewardPctT1: number | null;
  rewardPctT2: number | null;
  rrT1I1: number | null;
  rrT2I1: number | null;
  rrT1I2: number | null;
  rrT2I2: number | null;
  pathT1I1: CounterfactualReplayEvent | null;
  pathT2I1: CounterfactualReplayEvent | null;
  pathT1I2: CounterfactualReplayEvent | null;
  pathT2I2: CounterfactualReplayEvent | null;
  barsToTargetT1: number | null;
  barsToTargetT2: number | null;
  barsToInvalidationT1: number | null;
  barsToInvalidationI2: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeToTargetDistanceRatio: number | null;
  maeToRiskDistanceRatio: number | null;
  canonicalReplayEvent: CounterfactualReplayEvent | null;
  maxFavorableMovePctBeforeFill: number | null;
  evaluationBarIndex: number;
  policyClassification: string;
  evaluatorStatus: string;
  rewardBucket: string;
  displacementBucket: string;
  headroomPresence: string;
  rrBucket: string;
  direction: "BULLISH" | "BEARISH";
  waveLabel: string;
  setupFamilyId: string;
}

export interface HistoricalDelayedEntrySimulationBundle {
  horizonBars: number;
  tradeCount: number;
  resultsByScenarioKey: Readonly<Record<string, readonly HistoricalDelayedEntryTradeSimResult[]>>;
}

export interface MissedEntryAnalysisRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  notFilled: number;
  canonicalTargetReachedCount: number;
  canonicalInvalidationCount: number;
  note: string;
}

export interface HistoricalDelayedEntryResearchReport {
  schemaVersion: typeof HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    replayClassifiable: number;
    notReplayable: number;
    horizonBars: number;
  };
  canonicalBaseline: {
    entryAt: "E_CLOSE";
    target: "lifecycle.targetReferencePrice";
    invalidation: "lifecycle.invalidationReferencePrice";
    pathSource: "B-12w CANONICAL_DISPLACEMENT_EQUALITY";
    note: string;
  };
  comparisonTableT1: readonly EntryQualityComparisonRow[];
  comparisonTableT2: readonly EntryQualityComparisonRow[];
  entryQualityComparison: readonly EntryQualityComparisonRow[];
  missedEntryAnalysis: readonly MissedEntryAnalysisRow[];
  tradeOffSummary: readonly {
    model: DelayedEntryModelId;
    levelLabel: string;
    fillRate: number | null;
    meanImprovement: number | null;
    medianImprovement: number | null;
    missedEntry: number;
    note: string;
  }[];
  failedFavorableDelayedEntry: readonly EntryQualityComparisonRow[];
  passedAdverseDelayedEntry: readonly EntryQualityComparisonRow[];
  targetDistanceBuckets: readonly {
    bucketLabel: string;
    rows: readonly EntryQualityComparisonRow[];
  }[];
  contextSlices: readonly {
    dimension: string;
    bucket: string;
    model: DelayedEntryModelId;
    levelLabel: string;
    fillRate: number | null;
    medianImprovement: number | null;
    tag: ResearchFindingTag;
  }[];
  temporalDescriptiveSplit: {
    label: "TEMPORAL_DESCRIPTIVE_SPLIT";
    earlierFraction: number;
    modelSummaries: readonly {
      model: DelayedEntryModelId;
      levelLabel: string;
      earlierFillRate: number | null;
      laterFillRate: number | null;
      earlierMedianImprovement: number | null;
      laterMedianImprovement: number | null;
    }[];
    note: string;
  };
  diagnosticSummary: readonly { question: string; answer: string; tag: ResearchConclusionTag }[];
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: {
    entryLevelComputedAt: "E";
    fillDetectionFrom: "E+1";
    outcomeFrom: "ENTRY_FILL_BAR+1";
    statement: string;
  };
  parity: {
    b12wCanonicalBaselineReachMatch: boolean;
    note: string;
  };
  warnings: readonly string[];
  tradeExamples: readonly { tradeId: string; model: string; status: DelayedEntryLifecycleStatus; note: string }[];
  consumedReports: Record<string, boolean>;
}
