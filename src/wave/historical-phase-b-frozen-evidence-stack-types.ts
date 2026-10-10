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
import type { HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport } from "./historical-target-distance-reachability-cost-balance-analysis-types";
import type { HistoricalTargetDistanceStructuralContextAnalysisReport } from "./historical-target-distance-structural-context-analysis-types";
import type { HistoricalTargetProvenanceStructuralDistanceAnalysisReport } from "./historical-target-provenance-structural-distance-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalDelayedEntryResearchReport } from "./historical-delayed-entry-research-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { HistoricalPhaseBIntegratedEvidenceAuditReport } from "./historical-phase-b-integrated-evidence-audit-types";
import type { PhaseBResearchDatasetRef, PhaseBResearchScopeKey } from "./historical-phase-b-multi-symbol-regime-validation-types";
import type { BuildHistoricalPhaseBMultiSymbolRegimeValidationInput } from "./historical-phase-b-multi-symbol-regime-validation-types";
import type { LoadedHistoricalFrozenOhlcvDataset } from "./historical-frozen-ohlcv-dataset-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { Candle } from "./types";
import type { MultiSymbol1hResearchFrozenSymbol } from "./historical-frozen-ohlcv-dataset-types";

export const HISTORICAL_PHASE_B_FROZEN_EVIDENCE_STACK_SCHEMA_VERSION = "1.0" as const;

export const HISTORICAL_PHASE_B_MULTISYMBOL_EVIDENCE_ARTIFACT_V1_RELATIVE_PATH =
  "src/wave/fixtures/historical-phase-b-multisymbol-evidence-v1.json" as const;

export type PhaseBFrozenEvidenceStackStatus = "PASS" | "FAILED";

export type PhaseBFrozenEvidenceStackFailureCode =
  | "DATASET_CHECKSUM_MISMATCH"
  | "INSUFFICIENT_CANDLES"
  | "STACK_BUILD_ERROR";

export interface PhaseBEvidenceStackFingerprint {
  scopeKey: PhaseBResearchScopeKey;
  symbol: string;
  timeframe: string;
  datasetChecksum: string;
  candleCount: number;
  independentTrades: number;
  replayClassifiable: number | null;
  notReplayable: number | null;
  horizonBars: number;
  b14Threshold1ReachRate: number | null;
  b14Threshold1ReachedCount: number;
  b12wCanonicalTargetReachRate: number | null;
  b12xCostCoverageAt020: number | null;
  b19ModelDBuselineFillRate: number | null;
  b20MissingSectionsCount: number;
  b20ProductionRuleStatus: string;
  fingerprintDigest: string;
}

export interface HistoricalPhaseBFrozenEvidenceStack {
  scopeKey: PhaseBResearchScopeKey;
  symbol: MultiSymbol1hResearchFrozenSymbol;
  timeframe: "1H";
  status: PhaseBFrozenEvidenceStackStatus;
  failureCode: PhaseBFrozenEvidenceStackFailureCode | null;
  failureMessage: string | null;
  dataset: PhaseBResearchDatasetRef;
  loaded: LoadedHistoricalFrozenOhlcvDataset;
  candles: readonly Candle[];
  lifecycleReport: IndependentTradeLifecycleReport;
  eligibilityAuditReport: HistoricalIndependentTradeREligibilityAuditReport;
  rrThresholdTheoreticalRAnalysisReport: HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport;
  historicalEntryPriceMoveQualityAnalysisReport: HistoricalEntryPriceMoveQualityAnalysisReport;
  historicalTargetProvenanceStructuralDistanceAnalysisReport: HistoricalTargetProvenanceStructuralDistanceAnalysisReport;
  displacementEqualityTargetMechanicsReport: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  structuralExtremeVsDisplacementTargetReport: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  alternativeTargetModelAnalysisReport: HistoricalAlternativeTargetModelAnalysisReport;
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport: HistoricalCostAwareCounterfactualAnalysisReport;
  historicalTargetDistanceStructuralContextAnalysisReport: HistoricalTargetDistanceStructuralContextAnalysisReport;
  historicalTargetDistanceReachabilityCostBalanceAnalysisReport: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport;
  historicalEntryContextTargetResearchReport: HistoricalEntryContextTargetResearchReport;
  futureMoveAnalysisReport: HistoricalEntryContextFutureMoveAnalysisReport;
  futureMovePredictivenessAnalysisReport: HistoricalEntryContextFutureMovePredictivenessAnalysisReport;
  entryContextCombinationFutureMoveAnalysisReport: HistoricalEntryContextCombinationFutureMoveAnalysisReport;
  signalIndependenceAuditReport: HistoricalEntryContextSignalIndependenceAuditReport;
  delayedEntryResearchReport: HistoricalDelayedEntryResearchReport;
  delayedEntryDecisionAuditReport: HistoricalDelayedEntryDecisionAuditReport;
  integratedEvidenceAuditReport: HistoricalPhaseBIntegratedEvidenceAuditReport;
  fingerprint: PhaseBEvidenceStackFingerprint;
}

export interface PhaseBFrozenEvidenceStackFailure {
  symbol: MultiSymbol1hResearchFrozenSymbol;
  scopeKey: PhaseBResearchScopeKey;
  failureCode: PhaseBFrozenEvidenceStackFailureCode;
  message: string;
}

export interface HistoricalPhaseBMultisymbolFrozenEvidenceStacksResult {
  schemaVersion: typeof HISTORICAL_PHASE_B_FROZEN_EVIDENCE_STACK_SCHEMA_VERSION;
  stacks: readonly HistoricalPhaseBFrozenEvidenceStack[];
  failures: readonly PhaseBFrozenEvidenceStackFailure[];
  stacksByScope: Readonly<Partial<Record<PhaseBResearchScopeKey, HistoricalPhaseBFrozenEvidenceStack>>>;
  b21Input: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput;
  artifact: HistoricalPhaseBMultisymbolEvidenceArtifactV1;
}

export interface HistoricalPhaseBMultisymbolEvidenceArtifactV1 {
  schemaVersion: "1.0";
  generatedNote: string;
  scopes: readonly {
    scopeKey: PhaseBResearchScopeKey;
    symbol: string;
    timeframe: string;
    datasetChecksum: string;
    candleCount: number;
    firstTimestamp: number;
    lastTimestamp: number;
    stackStatus: PhaseBFrozenEvidenceStackStatus;
    failureCode: PhaseBFrozenEvidenceStackFailureCode | null;
    fingerprintDigest: string;
    reportAvailability: {
      b12ThroughB20: boolean;
      integratedEvidence: boolean;
      missingSectionsCount: number;
    };
  }[];
}

/** Locked BTCUSDT:1H fingerprint for B-23 parity (frozen pipeline). */
export const PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN = {
  datasetChecksum: "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc",
  candleCount: 3000,
  independentTrades: 336,
  replayClassifiable: 320,
  notReplayable: 16,
  horizonBars: 24,
  b14Threshold1ReachedCount: 320,
  failedFavorableTrades: 97,
  passedAdverseTrades: 88,
} as const;
