import type {
  ReferenceLevel,
  SetupCandidate,
  SetupDirectionalBasis,
  SetupDirectionalBias,
  SetupInvalidationView,
  SetupLifecycleStatus,
  SetupScenarioRef,
  SetupSourceScenarioView,
} from "./setup-types";

export const ENTRY_PLAN_SCHEMA_VERSION = "1.0" as const;

/**
 * Entry Plan eligibility is stricter than `isEntryPlanEligibleSetup()` alone:
 * confirmed trade setup plus established closed evaluation-bar boundary.
 */
export type EntryPlanEligibilityReason =
  | "ENTRY_PLAN_ELIGIBLE"
  | "NOT_TRADE_SETUP"
  | "SETUP_NOT_CONFIRMED"
  | "SETUP_INVALID"
  | "INSUFFICIENT_CONTEXT"
  | "CLOSED_BAR_NOT_ESTABLISHED";

export interface EntryPlanEligibility {
  eligible: boolean;
  reason: EntryPlanEligibilityReason;
  detail: string;
}

export interface EntryPlanEvaluationBarRef {
  evaluationBarIndex: number;
  boundaryEstablished: boolean;
  contractDetail: string;
}

export interface EntryPlanSetupRef {
  setupId: string;
  setupTypeId: string;
  setupTypeLabel: string;
  sourceSetupStatus: SetupLifecycleStatus;
}

/** Structural invalidation from source setup — not a stop-loss price (14D.3). */
export interface EntryPlanInvalidationRef {
  usesScenarioInvalidation: boolean;
  summary: string;
  conditions: SetupInvalidationView["conditions"];
}

/**
 * Snapshot boundary between confirmed trade setup and execution-plan construction (14D.2+).
 * No entry price, SL, TP, RR, or order semantics.
 */
export interface EntryPlanCandidate {
  schemaVersion: typeof ENTRY_PLAN_SCHEMA_VERSION;
  id: string;
  symbol: string;
  timeframe: string;
  setupRef: EntryPlanSetupRef;
  scenarioRef: SetupScenarioRef;
  setupTypeId: string;
  directionalBias: SetupDirectionalBias | null;
  directionalBasis: SetupDirectionalBasis;
  evaluationBar: EntryPlanEvaluationBarRef;
  invalidation: EntryPlanInvalidationRef;
  referenceLevels: ReferenceLevel[];
  sourceScenario: SetupSourceScenarioView;
  context: SetupCandidate["context"];
  eligibility: EntryPlanEligibility;
  limitations: string[];
  evaluationNotes: string[];
}

export interface EntryPlanBuildResult {
  eligibility: EntryPlanEligibility;
  plan: EntryPlanCandidate | null;
}

export interface EntryPlanEvaluationBarSource {
  evaluationBarIndex: number;
  evaluationBarBoundaryEstablished: boolean;
  evaluationBarContractDetail: string;
}

export interface EntryPlanBuildInput {
  setup: SetupCandidate;
  evaluationBar?: EntryPlanEvaluationBarSource;
}

export interface EntryPlanReport {
  schemaVersion: typeof ENTRY_PLAN_SCHEMA_VERSION;
  timeframe: string;
  symbols: string[];
  plans: EntryPlanCandidate[];
  planCount: number;
  limitations: string[];
}
