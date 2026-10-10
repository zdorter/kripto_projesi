import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDelayedEntryDecisionAuditReport } from "./historical-delayed-entry-decision-audit-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalEntryContextCombinationFutureMoveAnalysisReport } from "./historical-entry-context-combination-future-move-analysis-types";
import type { HistoricalEntryContextFutureMoveAnalysisReport } from "./historical-entry-context-future-move-analysis-types";
import type { HistoricalEntryContextFutureMovePredictivenessAnalysisReport } from "./historical-entry-context-future-move-predictiveness-analysis-types";
import type { HistoricalEntryContextSignalIndependenceAuditReport } from "./historical-entry-context-signal-independence-audit-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalEntryPriceMoveQualityAnalysisReport } from "./historical-entry-price-move-quality-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport } from "./historical-target-distance-reachability-cost-balance-analysis-types";
import type { HistoricalTargetDistanceStructuralContextAnalysisReport } from "./historical-target-distance-structural-context-analysis-types";
import type { HistoricalTargetProvenanceStructuralDistanceAnalysisReport } from "./historical-target-provenance-structural-distance-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalDelayedEntryResearchReport } from "./historical-delayed-entry-research-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { Candle } from "./types";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import type { DelayedEntryModelId } from "./historical-delayed-entry-research-types";

export const HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION = "1.0" as const;

export type EvidenceTag =
  | "HISTORICAL_EVIDENCE"
  | "HISTORICAL_ASSOCIATION"
  | "COUNTERFACTUAL_EVIDENCE"
  | "RESEARCH_CANDIDATE"
  | "NOT_ESTABLISHED"
  | "DESCRIPTIVE_DECISION_SURFACE";

export type EvidenceCoverageLevel = "HIGH" | "MEDIUM" | "LOW";

export interface BuildHistoricalPhaseBIntegratedEvidenceAuditInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  historicalEntryPriceMoveQualityAnalysisReport?: HistoricalEntryPriceMoveQualityAnalysisReport;
  historicalTargetProvenanceStructuralDistanceAnalysisReport?: HistoricalTargetProvenanceStructuralDistanceAnalysisReport;
  displacementEqualityTargetMechanicsReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
  reachabilityReplayReport?: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
  historicalTargetDistanceStructuralContextAnalysisReport?: HistoricalTargetDistanceStructuralContextAnalysisReport;
  historicalTargetDistanceReachabilityCostBalanceAnalysisReport?: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport;
  historicalEntryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  futureMoveAnalysisReport?: HistoricalEntryContextFutureMoveAnalysisReport;
  futureMovePredictivenessAnalysisReport?: HistoricalEntryContextFutureMovePredictivenessAnalysisReport;
  entryContextCombinationFutureMoveAnalysisReport?: HistoricalEntryContextCombinationFutureMoveAnalysisReport;
  signalIndependenceAuditReport?: HistoricalEntryContextSignalIndependenceAuditReport;
  delayedEntryResearchReport?: HistoricalDelayedEntryResearchReport;
  delayedEntryDecisionAuditReport?: HistoricalDelayedEntryDecisionAuditReport;
  candles?: readonly Candle[];
}

export interface PhaseSourceMatrixRow {
  phaseId: string;
  reportKey: string;
  consumed: boolean;
  schemaVersion: string | null;
  note: string;
}

export interface TargetMagnitudeEvidenceRow {
  rewardBucketLabel: string;
  population: number | null;
  targetReachRate: number | null;
  costCoverageAt020: number | null;
  theoreticalRReferenceNote: string;
  tag: EvidenceTag;
}

export interface FutureMoveEvidenceRow {
  thresholdPercent: number;
  futureMoveReachRate: number | null;
  medianBarsToReach: number | null;
  medianMfePercent: number | null;
  source: "B-14" | "B-15" | "NOT_AVAILABLE";
}

export interface DescriptiveDecisionSurfaceCell {
  entryModel: DelayedEntryModelId;
  retracementLevel: string;
  targetModel: "T1_FROZEN_TARGET" | "T2_REPROJECTED_TARGET";
  fillRate: number | null;
  missedRate: number | null;
  medianImprovement: number | null;
  targetReach: number | null;
  invalidationRate: number | null;
  medianRR: number | null;
  costCoverage020: number | null;
  tag: "DESCRIPTIVE_DECISION_SURFACE";
}

export interface CanonicalVsDelayedDeltaRow {
  entryModel: DelayedEntryModelId;
  levelLabel: string;
  fillRateDelta: number | null;
  improvementDelta: number | null;
  t1ReachDelta: number | null;
  medianRrDelta: number | null;
  costCoverage020Delta: number | null;
}

export interface TargetDecisionSurfaceRow {
  targetModelId: AlternativeTargetModelId | "CANONICAL" | "NOT_MEASURABLE";
  rewardBucketLabel: string | null;
  targetReachRate: number | null;
  targetBeforeInvalidationRate: number | null;
  costCoverageNote: string;
}

export interface CostSurfaceRow {
  roundTripCostPercent: number;
  targetModelLabel: string;
  entryModelLabel: string;
  grossMarginMedian: number | null;
  netMarginMedian: number | null;
  costCoverageRate: number | null;
  source: "B-12x" | "B-19" | "NOT_AVAILABLE";
}

export interface RiskRrSurfaceRow {
  label: string;
  invalidationModel: "I1" | "I2" | "CANONICAL";
  medianRiskPct: number | null;
  medianRewardPct: number | null;
  medianCounterfactualRr: number | null;
  theoreticalRNote: string;
}

export interface ResearchCandidate {
  label: string;
  evidence: string;
  supportingReports: readonly string[];
  sampleSize: number | null;
  directEvidence: readonly string[];
  associativeEvidence: readonly string[];
  counterfactualEvidence: readonly string[];
  limitations: readonly string[];
  nextExperiment: readonly string[];
  evidenceCoverage: EvidenceCoverageLevel;
  status: "RESEARCH_CANDIDATE";
}

export interface HistoricalPhaseBIntegratedEvidenceAuditReport {
  schemaVersion: typeof HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    replayClassifiable: number;
    notReplayable: number;
    horizonBars: number;
  };
  phaseSourceMatrix: readonly PhaseSourceMatrixRow[];
  missingSections: readonly string[];
  targetMagnitudeEvidence: readonly TargetMagnitudeEvidenceRow[];
  futureMoveEvidence: readonly FutureMoveEvidenceRow[];
  structuralHeadroomEvidence: readonly {
    headroomBucket: string;
    trades: number | null;
    note: string;
    tag: EvidenceTag;
  }[];
  delayedEntryEvidenceSummary: readonly {
    model: DelayedEntryModelId;
    levelLabel: string;
    fillRate: number | null;
    missedRate: number | null;
    medianImprovement: number | null;
    t1Reach: number | null;
    t2Reach: number | null;
    source: "B-18" | "B-19";
  }[];
  entryDecisionSurface: readonly DescriptiveDecisionSurfaceCell[];
  canonicalVsDelayedDeltas: readonly CanonicalVsDelayedDeltaRow[];
  targetDecisionSurface: readonly TargetDecisionSurfaceRow[];
  costSurface: readonly CostSurfaceRow[];
  riskRrSurface: readonly RiskRrSurfaceRow[];
  contextConditionalEvidence: readonly {
    dimension: string;
    bucket: string;
    note: string;
    tag: EvidenceTag;
  }[];
  signalIndependenceSummary: readonly {
    signal: string;
    validityClass: string;
    note: string;
  }[];
  failedFavorableEvidence: { cohortSize: number; note: string; source: string };
  passedAdverseEvidence: { cohortSize: number; note: string; source: string };
  temporalStabilitySummary: readonly {
    source: string;
    label: string;
    note: string;
  }[];
  multipleComparisonWarning: { statement: string };
  directObservations: readonly string[];
  associationalFindings: readonly string[];
  counterfactualEvidence: readonly string[];
  notEstablished: readonly string[];
  lookaheadAttestation: {
    entryContextEnd: "E";
    outcomeFrom: "E+1";
    statement: string;
  };
  researchCandidates: readonly ResearchCandidate[];
  limitations: readonly string[];
  productionDecision: {
    productionRuleStatus: "NOT_ESTABLISHED";
    entryRuleStatus: "NOT_ESTABLISHED";
    targetRuleStatus: "NOT_ESTABLISHED";
    delayedEntryRuleStatus: "NOT_ESTABLISHED";
    generalMarketRule: "NOT_ESTABLISHED";
  };
  parityNotes: readonly { phaseId: string; note: string; populationMatch: boolean }[];
  statisticalQualityAttestation: {
    reachRateConfidence: "Wilson_95_when_present_in_source_reports";
    sampleSizeLabels: readonly string[];
    interpretWithCautionWhenNBelow10: true;
  };
  warnings: readonly string[];
  consumedReports: Record<string, boolean>;
}
