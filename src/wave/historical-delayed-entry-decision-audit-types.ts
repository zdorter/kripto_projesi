import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalEntryContextCombinationFutureMoveAnalysisReport } from "./historical-entry-context-combination-future-move-analysis-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEntryContextSignalIndependenceAuditReport } from "./historical-entry-context-signal-independence-audit-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { Candle } from "./types";
import type {
  CounterfactualTargetModelId,
  DelayedEntryModelId,
  HistoricalDelayedEntryResearchReport,
  ResearchFindingTag,
} from "./historical-delayed-entry-research-types";
import { ROUND_TRIP_COST_SCENARIOS } from "./historical-delayed-entry-research-types";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";

export const HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION = "1.0" as const;

export const DECISION_AUDIT_COST_SCENARIOS_PERCENT = [0, ...ROUND_TRIP_COST_SCENARIOS] as const;

export interface BuildHistoricalDelayedEntryDecisionAuditInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  delayedEntryResearchReport: HistoricalDelayedEntryResearchReport;
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  candles: readonly Candle[];
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  entryContextCombinationFutureMoveAnalysisReport?: HistoricalEntryContextCombinationFutureMoveAnalysisReport;
  signalIndependenceAuditReport?: HistoricalEntryContextSignalIndependenceAuditReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
}

export interface B18ParityCheckRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  targetModel: CounterfactualTargetModelId;
  field: string;
  b18Value: number | null;
  recomputedValue: number | null;
  match: boolean;
}

export interface InvalidationModelComparisonRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  targetModel: CounterfactualTargetModelId;
  invalidationModel: "I1_FROZEN_INVALIDATION" | "I2_RELATIVE_RISK_REFERENCE";
  trades: number;
  filled: number;
  medianRiskPct: number | null;
  medianCounterfactualRr: number | null;
  invalidationRate: number | null;
  targetReachRate: number | null;
  note: string;
}

export interface CostMatrixCell {
  model: DelayedEntryModelId;
  levelLabel: string;
  targetModel: CounterfactualTargetModelId;
  roundTripCostPercent: number;
  reached: number;
  costCovered: number;
  costCoverageRate: number | null;
  meanGrossMarginPercent: number | null;
  medianGrossMarginPercent: number | null;
  meanNetMarginPercent: number | null;
  medianNetMarginPercent: number | null;
  tag: ResearchFindingTag;
}

export interface MissedEntryDetailRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  total: number;
  filled: number;
  notFilled: number;
  canonicalTargetReached: number;
  canonicalInvalidationReached: number;
  canonicalNoTouch: number;
  canonicalAmbiguous: number;
  medianMaxFavorableMovePctBeforeFill: number | null;
  counterfactualReferenceNote: string;
}

export interface ImprovementDistributionRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  meanImprovement: number | null;
  medianImprovement: number | null;
  p25Improvement: number | null;
  p75Improvement: number | null;
  minImprovement: number | null;
  maxImprovement: number | null;
  fillRate: number | null;
  missedRate: number | null;
}

export interface DecisionComparisonRow {
  model: DelayedEntryModelId;
  levelLabel: string;
  fillRate: number | null;
  missedRate: number | null;
  medianImprovement: number | null;
  t1TargetReachRate: number | null;
  t2TargetReachRate: number | null;
  medianRrI1: number | null;
  costCoverageAt020: number | null;
  fillRateWilson95: IndependentTradeWinRateConfidenceInterval;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  tag: ResearchFindingTag;
}

export interface HistoricalDelayedEntryDecisionAuditReport {
  schemaVersion: typeof HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: HistoricalDelayedEntryResearchReport["population"];
  b18Parity: {
    allMatch: boolean;
    mismatchCount: number;
    rows: readonly B18ParityCheckRow[];
    note: string;
  };
  auditBlocked: boolean;
  invalidationComparison: {
    i1Note: string;
    i2Note: string;
    rows: readonly InvalidationModelComparisonRow[];
  };
  targetModelSeparation: {
    t1Note: string;
    t2Note: string;
    t1ReachSummary: readonly DecisionComparisonRow[];
    t2ReachSummary: readonly DecisionComparisonRow[];
  };
  fullCostMatrix: readonly CostMatrixCell[];
  missedEntryDetail: readonly MissedEntryDetailRow[];
  improvementDistribution: readonly ImprovementDistributionRow[];
  missedMoveTradeOff: readonly ImprovementDistributionRow[];
  decisionComparisonTable: readonly DecisionComparisonRow[];
  failedFavorableAudit: readonly DecisionComparisonRow[];
  passedAdverseAudit: readonly DecisionComparisonRow[];
  temporalDescriptiveSplit: HistoricalDelayedEntryResearchReport["temporalDescriptiveSplit"];
  targetRewardBucketAudit: readonly {
    bucketLabel: string;
    rows: readonly DecisionComparisonRow[];
  }[];
  contextSliceAudit: HistoricalDelayedEntryResearchReport["contextSlices"];
  mfeMaeSummary: readonly {
    model: DelayedEntryModelId;
    levelLabel: string;
    medianMfePct: number | null;
    medianMaePct: number | null;
    medianMfeToTargetRatio: number | null;
    medianMaeToRiskRatio: number | null;
    outcomeWindowNote: string;
  }[];
  timeToFillSummary: readonly {
    model: DelayedEntryModelId;
    levelLabel: string;
    medianBarsToFill: number | null;
    p25BarsToFill: number | null;
    p75BarsToFill: number | null;
    medianBarsToTargetAfterFill: number | null;
    medianBarsToInvalidationI1: number | null;
  }[];
  targetReachDetail: readonly {
    model: DelayedEntryModelId;
    levelLabel: string;
    targetModel: CounterfactualTargetModelId;
    invalidationModel: "I1_FROZEN_INVALIDATION" | "I2_RELATIVE_RISK_REFERENCE";
    targetReachRate: number | null;
    invalidationFirstRate: number | null;
    noTouchRate: number | null;
    ambiguousRate: number | null;
    medianBarsToTarget: number | null;
  }[];
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: HistoricalDelayedEntryResearchReport["lookaheadAttestation"];
  multipleComparisonWarning: { note: string };
  productionDecisionAudit: {
    question: string;
    conclusion: "NOT_ESTABLISHED";
    rationale: readonly string[];
    tag: ResearchConclusionTag;
  };
  diagnosticSummary: readonly { question: string; answer: string; tag: ResearchConclusionTag }[];
  warnings: readonly string[];
  consumedReports: Record<string, boolean>;
}

export type CanonicalReferenceOutcome = CounterfactualReplayEvent;
