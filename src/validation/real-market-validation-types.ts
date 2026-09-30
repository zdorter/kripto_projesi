import type { ConditionOutcome, SetupLifecycleStatus } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationAggregateState } from "../wave/setup/trade-setup-evaluation-types";

export const REAL_MARKET_VALIDATION_SCHEMA_VERSION = "1.7" as const;

export type RealMarketStopFailureReason =
  | "STOP_REFERENCE_AVAILABLE"
  | "STOP_SOURCE_MISSING"
  | "STOP_DIRECTION_MISSING"
  | "STOP_CLOSED_BAR_MISSING"
  | "STOP_INVALIDATION_ALREADY_TRIGGERED"
  | "STOP_GEOMETRY_INVALID"
  | "STOP_SOURCE_SCOPE_UNAVAILABLE"
  | "STOP_PLAN_INELIGIBLE"
  | "STOP_SETUP_NOT_CONFIRMED"
  | "OTHER_CONTRACT_FAILURE";

export interface RealMarketStopPlanDiagnostic {
  symbol: string;
  timeframe: string;
  setupId: string;
  entryPlanId: string;
  setupTypeId: string;
  directionalBias: string | null;
  directionalBasis: string | null;
  scenarioWaveLabel: string;
  segmentStartIndex: number;
  segmentEndIndex: number;
  segmentStartPrice: number;
  segmentEndPrice: number;
  envelopeLow: number;
  envelopeHigh: number;
  evaluationBarIndex: number;
  evaluationBarBoundaryEstablished: boolean;
  invalidationSource: string | null;
  invalidationPrice: number | null;
  usesScenarioInvalidation: boolean;
  scenarioInvalidationAvailable: boolean | null;
  stopModelId: string;
  stopOutcome: string;
  stopRationale: string;
  stopPrice: number | null;
  failureReason: RealMarketStopFailureReason;
  geometryValid: boolean | null;
  entryReferencePrice: number | null;
  entryVsInvalidationNote: string | null;
  stopLimitations: string[];
  stopModelOutcomes?: Array<{
    modelId: string;
    scopeSemantics: string | null;
    outcome: string;
    stopPrice: number | null;
    rationale: string;
  }>;
  selectedStopModelId: string | null;
  selectedStopPrice: number | null;
}

export interface RealMarketStopModelSummary {
  byModelId: Record<
    string,
    {
      available: number;
      insufficient: number;
      notApplicable: number;
    }
  >;
}

export interface RealMarketSelectedStopModelSummary {
  byModelId: Record<string, number>;
  planCount: number;
}

export type ConditionOutcomeCounts = Record<ConditionOutcome, number>;

export interface RealMarketConditionGroupSummary {
  [conditionId: string]: ConditionOutcomeCounts;
}

export interface RealMarketSetupTypeConditionSummary {
  prerequisite: RealMarketConditionGroupSummary;
  trigger: RealMarketConditionGroupSummary;
  confirmation: RealMarketConditionGroupSummary;
  invalidation: RealMarketConditionGroupSummary;
}

export interface RealMarketConditionSummary {
  bySetupType: Record<string, RealMarketSetupTypeConditionSummary>;
}

export interface RealMarketStopScopeCompatibilitySummary {
  bySource: Record<
    string,
    {
      considered: number;
      geometryAccepted: number;
      geometryRejected: number;
    }
  >;
}

export interface RealMarketInvalidationScopeDetailRow {
  symbol: string;
  scenarioId: string;
  waveLabel: string;
  structure: string;
  role: string;
  price: number | null;
}

export interface RealMarketInvalidationScopeSummary {
  bySource: Record<string, number>;
  scanResultCount: number;
  availableCount: number;
  bySourceDetails: Record<string, RealMarketInvalidationScopeDetailRow[]>;
}

export interface RealMarketScopeCompatibilityRow {
  source: string;
  structuralMeaning: string;
  segmentEnvelopeRequired: boolean;
  currentStopModelVerdict:
    | "COMPATIBLE"
    | "CONTRACT_REJECTED"
    | "UNKNOWN"
    | "UNSUPPORTED";
}

export interface RealMarketScenarioInvalidationCandidateReport {
  symbol: string;
  scenarioId: string;
  waveLabel: string;
  role: string;
  selectedSource: string;
  selectedPrice: number | null;
  candidates: Array<{
    source: string;
    price: number;
    wave?: string;
    rule: string;
    selectedByPolicy: boolean;
  }>;
  shadowedCandidateCount: number;
}

export interface RealMarketInvalidationFlowSummary {
  waveCandidateInvalidationAvailable: number;
  scenarioInvalidationAvailable: number;
  scannerInvalidationAvailable: number;
  setupScenarioInvalidationReferenceAvailable: number;
  entryPlanScenarioInvalidationAvailable: number;
  scannerAvailableSetupReferenceMissing: number;
  tradeSetupCount: number;
  scanResultCount: number;
}

export type RealMarketBlockerReason =
  | "SETUP_NOT_CONFIRMED"
  | "SETUP_INVALID"
  | "SETUP_INSUFFICIENT_CONTEXT"
  | "CLOSED_BAR_NOT_ESTABLISHED"
  | "ENTRY_PLAN_NOT_CREATED"
  | "INVALIDATION_MISSING"
  | "UPSTREAM_INVALIDATION_UNAVAILABLE"
  | "SETUP_INVALIDATION_MAPPING_MISSING"
  | "CONFIRMATION_DATA_MISSING"
  | "ABC_CONTEXT_MISSING"
  | "FIB_CONTEXT_MISSING"
  | "ENTRY_REFERENCE_MISSING"
  | "STOP_REFERENCE_MISSING"
  | "OBJECTIVE_TARGET_CONTEXT_MISSING"
  | "TARGET_SELECTION_NONE"
  | "TARGET_SELECTION_INSUFFICIENT"
  | "TARGET_REFERENCE_MISSING"
  | "RR_REFERENCE_MISSING"
  | "SCAN_SYMBOL_ERROR";

export type LayerAvailability = "AVAILABLE" | "INSUFFICIENT_CONTEXT" | "NOT_APPLICABLE";

export interface RealMarketSymbolSummary {
  symbol: string;
  timeframe: string;
  closedCandleCount: number;
  firstCandleTime: number;
  lastCandleTime: number;
  marketTrend: string;
  scenarioCount: number;
  setupCount: number;
  setupStatusCounts: Record<SetupLifecycleStatus, number>;
  entryPlanCount: number;
  evaluationCounts: Record<TradeSetupEvaluationAggregateState, number>;
}

export interface RealMarketTradeSetupDetail {
  symbol: string;
  timeframe: string;
  setupId: string;
  setupTypeId: string;
  setupStatus: SetupLifecycleStatus;
  directionalBias: string | null;
  directionalBasis: string | null;
  scenarioRole: string;
  scenarioStructure: string;
  scenarioWaveLabel: string;
  scenarioEngineStatus: string | undefined;
  scenarioStatus: string;
  entryPlanCreated: boolean;
  entryPlanEligibilityReason: string | null;
  entryAvailability: LayerAvailability;
  stopAvailability: LayerAvailability;
  objectiveTargetCandidates: Array<{ sourceId: string; outcome: string }>;
  targetSelectionOutcome: string | null;
  targetAvailability: LayerAvailability;
  rrAvailability: LayerAvailability;
  evaluationState: TradeSetupEvaluationAggregateState | null;
  blockers: RealMarketBlockerReason[];
}

export interface RealMarketValidationFunnel {
  tradeSetupCount: number;
  confirmedSetupCount: number;
  entryPlanCount: number;
  entryAvailableCount: number;
  stopAvailableCount: number;
  targetAvailableCount: number;
  rrAvailableCount: number;
  readyForFurtherEvaluationCount: number;
}

export interface RealMarketValidationReport {
  schemaVersion: typeof REAL_MARKET_VALIDATION_SCHEMA_VERSION;
  fetchedAt: string;
  timeframe: string;
  limit: number;
  symbols: string[];
  symbolSummaries: RealMarketSymbolSummary[];
  tradeSetupDetails: RealMarketTradeSetupDetail[];
  funnel: RealMarketValidationFunnel;
  blockerCounts: Record<string, number>;
  waveLabelDistribution: Record<string, number>;
  setupTypeStatusDistribution: Record<
    string,
    Record<SetupLifecycleStatus, number>
  >;
  directionalBiasDistribution: Record<string, number>;
  aggregate: {
    scenarioCount: number;
    tradeSetupCount: number;
    setupStatusCounts: Record<SetupLifecycleStatus, number>;
    entryPlanCount: number;
    entryAvailableCount: number;
    stopAvailableCount: number;
    targetAvailableCount: number;
    rrAvailableCount: number;
    evaluationCounts: Record<TradeSetupEvaluationAggregateState, number>;
  };
  conditionSummary: RealMarketConditionSummary;
  invalidationFlowSummary: RealMarketInvalidationFlowSummary;
  zeroConfirmedRootCauseNotes: Record<string, string[]>;
  stopDiagnostics: RealMarketStopPlanDiagnostic[];
  stopFailureSummary: Record<string, number>;
  invalidationScopeSummary: RealMarketInvalidationScopeSummary;
  stopScopeCompatibilitySummary: RealMarketStopScopeCompatibilitySummary;
  scopeCompatibilityMatrix: RealMarketScopeCompatibilityRow[];
  scenarioInvalidationCandidates: RealMarketScenarioInvalidationCandidateReport[];
  invalidationPrecedenceFindings: string[];
  correctiveTrackInvalidationNote: string;
  stopModelSummary: RealMarketStopModelSummary;
  selectedStopModelSummary: RealMarketSelectedStopModelSummary;
  objectiveTargetProductionDiagnostics: RealMarketObjectiveTargetProductionDiagnostic[];
  objectiveTargetSourceSummary: Record<
    string,
    { available: number; insufficient: number; notApplicable: number }
  >;
  selectedTargetSourceSummary: Record<string, number>;
  fibonacciProjectionPolicyDiagnostics: RealMarketFibonacciProjectionPolicyDiagnostic[];
  projectionPolicySummary: Record<string, number>;
  fibonacciAnchorDiagnostics: import("./real-market-fibonacci-anchor-diagnostics").RealMarketFibonacciAnchorDiagnostic[];
}

export interface RealMarketFibonacciProjectionPolicyDiagnostic {
  setupId: string;
  waveLabel: string;
  direction: string | null;
  evaluationBarIndex: number;
  anchorsAvailable: boolean;
  w1RangeStart: number | null;
  w1RangeEnd: number | null;
  wave1StartIndex: number | null;
  wave1EndIndex: number | null;
  wave2EndIndex: number | null;
  projectionFormulaAvailable: boolean;
  ratioPolicyAvailable: boolean;
  policyApplicableToWave: boolean;
  policyId: string | null;
  policyStatus: string;
  allowedRatios: number[];
  selectedRatio: number | null;
  projectionPrice: number | null;
  projectionCandidateOutcome: string;
  projectionCandidateReason: string;
  targetModelOutcome: string | null;
  targetModelPrice: number | null;
  rrOutcome: string | null;
}

export interface RealMarketObjectiveTargetSourceDiagnosticRow {
  sourceId: string;
  outcome: string;
  provenance: string | null;
  targetPrice: number | null;
  reason: string;
  inputsUsed: string[];
}

export interface RealMarketObjectiveTargetProductionDiagnostic {
  setupId: string;
  setupTypeId: string;
  symbol: string;
  scenarioWaveLabel: string;
  directionalBias: string | null;
  evaluationBarIndex: number;
  entryReferencePrice: number | null;
  stopReferencePrice: number | null;
  stopModelId: string | null;
  sources: RealMarketObjectiveTargetSourceDiagnosticRow[];
  selectionOutcome: string | null;
  selectedSource: string | null;
  selectedPrice: number | null;
  targetModelOutcome: string | null;
  targetModelPrice: number | null;
  rrOutcome: string | null;
  rrRatio: number | null;
  fibonacciDiagnosticAvailable: boolean;
  confirmedSwingCountAtBar: number;
  segmentOriginIndex: number;
}
