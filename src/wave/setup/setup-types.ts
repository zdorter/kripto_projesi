import type { MultiTimeframeWaveState } from "../multi-timeframe";
import type { WaveHierarchyReport } from "../wave-hierarchy";
import type { WaveScanReport, WaveScanResult } from "../wave-scanner";
import type {
  ScenarioLifecycleStatus,
  ScenarioRole,
} from "../wave-scenarios";
import type { StructureKind } from "../presentation-state";
import type { TrendDirection, WaveLabel, WaveStatus } from "../types";

export const SETUP_SCHEMA_VERSION = "1.0" as const;

/**
 * Setup-level gate for Entry Plan (14D+): `isTradeSetup === true` AND `status === CONFIRMED`.
 * Full Entry Plan build also requires an established closed evaluation-bar boundary
 * (`resolveEntryPlanEligibility` / `buildEntryPlanFromSetup`).
 */
export const ENTRY_PLAN_ELIGIBILITY_RULE =
  "isTradeSetup === true && status === CONFIRMED" as const;

export type SetupCategory = "STRUCTURAL_CONTEXT" | "TRADE_SETUP";

export type SetupLifecycleStatus =
  | "CANDIDATE"
  | "CONFIRMED"
  | "INVALID"
  | "INSUFFICIENT_CONTEXT";

export type ConditionOutcome =
  | "MET"
  | "NOT_MET"
  | "NOT_APPLICABLE"
  | "INSUFFICIENT_DATA";

export type SetupDirectionalBias = "BULLISH" | "BEARISH";

export type SetupDirectionalBasis =
  | "IMPULSE_COUNT_DIRECTION"
  | "LEG_PRICE_DELTA"
  | null;

export type SetupConditionId =
  | "scenario-active"
  | "engine-not-invalidated"
  | "segment-defined"
  | "invalidation-available"
  | "setup-invalidation-triggered"
  | "ht-trend-context"
  | "mtf-context-present"
  | "mtf-relationship-allows"
  | "mtf-relationship-aligned"
  | "hierarchy-context-present"
  | "hierarchy-time-contained"
  | "hierarchy-nesting-not-confirmed"
  | "fib-context-available"
  | "presentation-trend-alignment"
  | "evaluation-bar-available"
  | "impulse-context-available"
  | "corrective-abc-context-available"
  | "impulse-continuation-phase-active"
  | "c-leg-started"
  | "w2-not-invalidated"
  | "w4-structure-conflict-clear"
  | "impulse-leading-leg-confirmed-at-bar"
  | "c-leg-confirmed-at-bar"
  | "fib-w12-conformance-met"
  | "fib-abc-conformance-met";

export type SetupConditionIdOrTrade = SetupConditionId | string;

export interface ConditionEvaluation {
  conditionId: SetupConditionIdOrTrade;
  outcome: ConditionOutcome;
  detail: string;
}

export type ReferenceLevelKind =
  | "SEGMENT_START"
  | "SEGMENT_END"
  | "SCENARIO_INVALIDATION"
  | "MTF_LOWER_SEGMENT_START"
  | "MTF_LOWER_SEGMENT_END"
  | "HIERARCHY_HIGHER_SEGMENT"
  | "HIERARCHY_LOWER_SEGMENT";

export interface ReferenceLevel {
  kind: ReferenceLevelKind;
  label: string;
  price?: number;
  index?: number;
  timeframe?: string;
  note?: string;
}

export interface SetupScenarioRef {
  scenarioId: string;
  role: ScenarioRole;
  structure: StructureKind;
  waveLabel: WaveLabel;
  scenarioStatus: ScenarioLifecycleStatus;
  engineStatus?: WaveStatus;
}

export interface SetupTriggerView {
  conditions: ConditionEvaluation[];
  summary: string;
}

export interface SetupConfirmationView {
  conditions: ConditionEvaluation[];
  summary: string;
}

export interface SetupInvalidationView {
  conditions: ConditionEvaluation[];
  summary: string;
  usesScenarioInvalidation: boolean;
}

export interface SetupSourceScenarioView {
  confidence: number;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  evidence: string[];
  limitations: string[];
}

export interface SetupSymbolContext {
  multiTimeframe?: MultiTimeframeWaveState;
  hierarchy?: WaveHierarchyReport;
}

export interface SetupCandidate {
  schemaVersion: typeof SETUP_SCHEMA_VERSION;
  id: string;
  symbol: string;
  timeframe: string;
  scenarioRef: SetupScenarioRef;
  setupTypeId: string;
  setupTypeLabel: string;
  category: SetupCategory;
  isTradeSetup: boolean;
  status: SetupLifecycleStatus;
  directionalBias: SetupDirectionalBias | null;
  directionalBasis: SetupDirectionalBasis;
  trigger: SetupTriggerView;
  confirmation: SetupConfirmationView;
  invalidation: SetupInvalidationView;
  referenceLevels: ReferenceLevel[];
  sourceScenario: SetupSourceScenarioView;
  context: {
    marketTrendHigher?: TrendDirection;
    marketTrendLower?: TrendDirection;
    mtfRelationshipKind?: string;
    hierarchyPrimaryRelationship?: string;
  };
  setupLimitations: string[];
  evaluationNotes: string[];
}

export interface SetupDetectionSymbolError {
  symbol: string;
  timeframe: string;
  scenarioId?: string;
  setupTypeId?: string;
  message: string;
}

export interface SetupDetectionInput {
  scanReport: WaveScanReport;
  tradeContext?: import("./trade-setup-types").TradeSetupEvaluationContext;
}

export interface SetupDetectionReport {
  schemaVersion: typeof SETUP_SCHEMA_VERSION;
  timeframe: string;
  symbols: string[];
  candidates: SetupCandidate[];
  candidateCount: number;
  errors: SetupDetectionSymbolError[];
  limitations: string[];
}

export interface SetupCatalogEntry {
  setupTypeId: string;
  label: string;
  description: string;
  category: SetupCategory;
  /** When false, lifecycle never reaches CONFIRMED (structural/watch context only). */
  isTradeSetup: boolean;
  allowedRoles?: ScenarioRole[];
  allowedStructures?: StructureKind[];
  allowedWaveLabels?: WaveLabel[];
  requiresMtf: boolean;
  triggerConditions: SetupConditionId[];
  confirmationConditions: SetupConditionId[];
  optionalConditions: SetupConditionId[];
}

export interface SetupEvaluationContext {
  scanRow: WaveScanResult;
  symbolContext?: SetupSymbolContext;
}
