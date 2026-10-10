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
import type { HistoricalPhaseBIntegratedEvidenceAuditReport } from "./historical-phase-b-integrated-evidence-audit-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { Candle } from "./types";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";

export const HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION = "1.0" as const;

export const PHASE_B_RESEARCH_PRIMARY_TIMEFRAME = "1H" as const;
export const PHASE_B_RESEARCH_SECONDARY_TIMEFRAME = "15m" as const;

export const PHASE_B_RESEARCH_TARGET_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

export type PhaseBResearchTargetSymbol = (typeof PHASE_B_RESEARCH_TARGET_SYMBOLS)[number];

export type PhaseBResearchScopeKey = `${string}:${string}`;

export type PhaseBResearchDatasetStatus = "AVAILABLE" | "DATASET_NOT_AVAILABLE";

export type PhaseBResearchEvidenceTag =
  | "DIRECT_OBSERVATION"
  | "CROSS_SYMBOL_OBSERVATION"
  | "CROSS_REGIME_OBSERVATION"
  | "ASSOCIATIONAL_FINDING"
  | "COUNTERFACTUAL_EVIDENCE"
  | "INSUFFICIENT_SAMPLE"
  | "NOT_ESTABLISHED";

export type PhaseBResearchReplicationStatus =
  | "REPLICATED"
  | "PARTIALLY_REPLICATED"
  | "REGIME_DEPENDENT"
  | "SYMBOL_DEPENDENT"
  | "NOT_REPLICATED"
  | "NOT_ESTABLISHED"
  | "INSUFFICIENT_SAMPLE";

export type PhaseBResearchStabilityClass =
  | "STABLE_ACROSS_SYMBOLS"
  | "PARTIALLY_STABLE"
  | "REGIME_DEPENDENT"
  | "SYMBOL_DEPENDENT"
  | "UNSTABLE"
  | "INSUFFICIENT_SAMPLE";

export type PhaseBResearchRegimeLabel = "BULLISH" | "BEARISH" | "NEUTRAL" | "REGIME_NOT_AVAILABLE";

export const PHASE_B_FUTURE_MOVE_THRESHOLDS_PERCENT = [
  0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10,
] as const;

export const PHASE_B_COST_SCENARIOS_PERCENT = [0, 0.1, 0.2, 0.3, 0.5] as const;

export interface PhaseBResearchDatasetRef {
  symbol: string;
  timeframe: string;
  fixturePath: string;
  datasetChecksum: string;
  candleCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  status: PhaseBResearchDatasetStatus;
  candles?: readonly Candle[];
}

export type PhaseBReportMap<T> = Readonly<Partial<Record<PhaseBResearchScopeKey, T>>>;

export interface BuildHistoricalPhaseBMultiSymbolRegimeValidationInput {
  datasets: readonly PhaseBResearchDatasetRef[];
  lifecycleReports: PhaseBReportMap<IndependentTradeLifecycleReport>;
  eligibilityAuditReports?: PhaseBReportMap<HistoricalIndependentTradeREligibilityAuditReport>;
  historicalEntryPriceMoveQualityAnalysisReports?: PhaseBReportMap<HistoricalEntryPriceMoveQualityAnalysisReport>;
  historicalTargetProvenanceStructuralDistanceAnalysisReports?: PhaseBReportMap<HistoricalTargetProvenanceStructuralDistanceAnalysisReport>;
  displacementEqualityTargetMechanicsReports?: PhaseBReportMap<HistoricalDisplacementEqualityTargetMechanicsAnalysisReport>;
  structuralExtremeVsDisplacementTargetReports?: PhaseBReportMap<HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport>;
  alternativeTargetModelAnalysisReports?: PhaseBReportMap<HistoricalAlternativeTargetModelAnalysisReport>;
  reachabilityReplayReports?: PhaseBReportMap<HistoricalAlternativeTargetReachabilityReplayReport>;
  costAwareCounterfactualAnalysisReports?: PhaseBReportMap<HistoricalCostAwareCounterfactualAnalysisReport>;
  historicalTargetDistanceStructuralContextAnalysisReports?: PhaseBReportMap<HistoricalTargetDistanceStructuralContextAnalysisReport>;
  historicalTargetDistanceReachabilityCostBalanceAnalysisReports?: PhaseBReportMap<HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport>;
  historicalEntryContextTargetResearchReports?: PhaseBReportMap<HistoricalEntryContextTargetResearchReport>;
  futureMoveAnalysisReports?: PhaseBReportMap<HistoricalEntryContextFutureMoveAnalysisReport>;
  futureMovePredictivenessAnalysisReports?: PhaseBReportMap<HistoricalEntryContextFutureMovePredictivenessAnalysisReport>;
  entryContextCombinationFutureMoveAnalysisReports?: PhaseBReportMap<HistoricalEntryContextCombinationFutureMoveAnalysisReport>;
  signalIndependenceAuditReports?: PhaseBReportMap<HistoricalEntryContextSignalIndependenceAuditReport>;
  delayedEntryResearchReports?: PhaseBReportMap<HistoricalDelayedEntryResearchReport>;
  delayedEntryDecisionAuditReports?: PhaseBReportMap<HistoricalDelayedEntryDecisionAuditReport>;
  integratedEvidenceAudits?: PhaseBReportMap<HistoricalPhaseBIntegratedEvidenceAuditReport>;
}

export interface DatasetMatrixRow {
  symbol: string;
  timeframe: string;
  status: PhaseBResearchDatasetStatus;
  fixturePath: string | null;
  datasetChecksum: string | null;
  candleCount: number | null;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  nextDatasetRequired: boolean;
  note: string;
}

export interface PopulationMatrixRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  timeframe: string;
  independentTrades: number;
  replayClassifiable: number | null;
  notReplayable: number | null;
  horizonBars: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface SymbolCoreMetricsRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  timeframe: string;
  canonicalTargetReachRate: number | null;
  futureMoveReachAt1Pct: number | null;
  futureMoveReachAt2Pct: number | null;
  medianMfePercent: number | null;
  costCoverageAt020: number | null;
  delayedFillAt025Pct: number | null;
  delayedImprovementAt025Pct: number | null;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface SymbolRegimeMatrixCell {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  timeframe: string;
  regime: PhaseBResearchRegimeLabel;
  trades: number;
  classifiable: number | null;
  targetReachRate: number | null;
  futureMoveReach1Pct: number | null;
  futureMoveReach2Pct: number | null;
  medianMfe: number | null;
  medianTargetDistancePct: number | null;
  costCoverageAt020: number | null;
  delayedFillAt025Pct: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  status: "REPORTED" | "INSUFFICIENT_SAMPLE" | "NOT_REPORTED";
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface TargetMagnitudeGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  rewardBucketLabel: string;
  population: number | null;
  targetReachRate: number | null;
  costCoverageAt020: number | null;
  theoreticalRReferenceNote: string;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface FutureMoveGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  thresholdPercent: number;
  futureMoveReachRate: number | null;
  medianBarsToReach: number | null;
  replicationVsBtc: PhaseBResearchReplicationStatus;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface HeadroomGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  headroomBucket: "HEADROOM_PRESENT" | "HEADROOM_ABSENT";
  population: number | null;
  targetReachRate: number | null;
  futureMoveReach1Pct: number | null;
  note: string;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface DisplacementGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  displacementBucket: string;
  trades: number;
  targetReachRate: number | null;
  futureMoveReach1Pct: number | null;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface DelayedEntryGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  levelLabel: string;
  fillRate: number | null;
  missedRate: number | null;
  medianImprovement: number | null;
  t1TargetReachRate: number | null;
  costCoverageAt020: number | null;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface TargetModelGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  modelId: AlternativeTargetModelId;
  targetReachRate: number | null;
  targetBeforeInvalidationRate: number | null;
  meanMfePercentage: number | null;
  costCoverageAt020: number | null;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface CostGeneralizationRow {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  roundTripCostPercent: number;
  costCoverageRate: number | null;
  grossMarginMedian: number | null;
  netMarginMedian: number | null;
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface CandidateValidationRow {
  candidateId: string;
  label: string;
  btcEvidence: string;
  crossSymbolEvidence: string;
  crossRegimeEvidence: string;
  sampleQuality: IndependentTradeSampleSizeQuality;
  geometryDependency: string;
  temporalBehavior: string;
  evidenceStatus: PhaseBResearchReplicationStatus;
  stabilityClass: PhaseBResearchStabilityClass;
  limitations: readonly string[];
  nextExperiment: readonly string[];
  tags: readonly PhaseBResearchEvidenceTag[];
}

export interface HistoricalPhaseBMultiSymbolRegimeValidationReport {
  schemaVersion: typeof HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION;
  datasetMatrix: readonly DatasetMatrixRow[];
  populationMatrix: readonly PopulationMatrixRow[];
  symbolSummary: readonly SymbolCoreMetricsRow[];
  regimeSummary: readonly {
    regime: PhaseBResearchRegimeLabel;
    scopesReporting: number;
    note: string;
    tags: readonly PhaseBResearchEvidenceTag[];
  }[];
  symbolRegimeMatrix: readonly SymbolRegimeMatrixCell[];
  targetMagnitudeGeneralization: readonly TargetMagnitudeGeneralizationRow[];
  futureMoveGeneralization: readonly FutureMoveGeneralizationRow[];
  headroomGeneralization: readonly HeadroomGeneralizationRow[];
  displacementGeneralization: readonly DisplacementGeneralizationRow[];
  delayedEntryGeneralization: readonly DelayedEntryGeneralizationRow[];
  targetModelGeneralization: readonly TargetModelGeneralizationRow[];
  costGeneralization: readonly CostGeneralizationRow[];
  riskRrGeneralization: readonly {
    scopeKey: PhaseBResearchScopeKey;
    symbol: string;
    label: string;
    medianRiskPct: number | null;
    medianCounterfactualRr: number | null;
    theoreticalRNote: string;
    tags: readonly PhaseBResearchEvidenceTag[];
  }[];
  contextGeneralization: readonly {
    scopeKey: PhaseBResearchScopeKey;
    symbol: string;
    dimension: string;
    bucket: string;
    note: string;
    tags: readonly PhaseBResearchEvidenceTag[];
  }[];
  candidateValidation: readonly CandidateValidationRow[];
  temporalStability: readonly {
    scopeKey: PhaseBResearchScopeKey;
    symbol: string;
    label: "TEMPORAL_DESCRIPTIVE_SPLIT";
    note: string;
    tags: readonly PhaseBResearchEvidenceTag[];
  }[];
  statisticalQuality: {
    reachRateConfidence: "Wilson_95_when_present_in_source_reports";
    sampleSizeLabels: readonly IndependentTradeSampleSizeQuality[];
    interpretWithCautionWhenNBelow10: true;
    correlationNote: string;
  };
  geometryDependency: {
    statement: string;
    perScope: readonly { scopeKey: PhaseBResearchScopeKey; validityClass: string | null }[];
    tags: readonly PhaseBResearchEvidenceTag[];
  };
  directObservations: readonly string[];
  associationalFindings: readonly string[];
  counterfactualEvidence: readonly string[];
  warnings: readonly string[];
  missingSections: readonly string[];
  nextExperiments: readonly string[];
  nextDatasetsRequired: readonly { symbol: string; timeframe: string; reason: string }[];
  productionDecision: {
    productionRuleStatus: "NOT_ESTABLISHED";
    entryRuleStatus: "NOT_ESTABLISHED";
    targetRuleStatus: "NOT_ESTABLISHED";
    delayedEntryRuleStatus: "NOT_ESTABLISHED";
    generalMarketRule: "NOT_ESTABLISHED";
  };
  lookaheadAttestation: {
    entryContextEnd: "E";
    outcomeFrom: "E+1";
    statement: string;
  };
  availableScopeKeys: readonly PhaseBResearchScopeKey[];
  crossSymbolScopeCount: number;
}
