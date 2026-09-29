import type { EntryPlanCandidate, EntryPlanEligibility } from "./entry-plan-types";
import type {
  ReferenceLevelKind,
  SetupDirectionalBias,
} from "./setup-types";

export const STOP_LOSS_MODEL_SCHEMA_VERSION = "1.0" as const;

/**
 * Maps structural scenario invalidation to a stop-loss reference (not an executable order).
 */
export type StopLossModelId = "SCENARIO_INVALIDATION_REFERENCE";

export type StopLossReferenceOutcome =
  | "STOP_REFERENCE_AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

export interface StopLossModelEvaluateInput {
  plan: EntryPlanCandidate;
}

/**
 * Stop-loss price reference — not a stop order sent to an exchange.
 */
export interface StopLossReference {
  schemaVersion: typeof STOP_LOSS_MODEL_SCHEMA_VERSION;
  modelId: StopLossModelId;
  modelLabel: string;
  outcome: StopLossReferenceOutcome;
  entryPlanId: string;
  setupTypeId: string;
  directionalBias: SetupDirectionalBias | null;
  stopPrice?: number;
  referenceKind?: ReferenceLevelKind;
  referenceSource: string;
  rationale: string;
  limitations: string[];
}

export interface StopLossModelReport {
  schemaVersion: typeof STOP_LOSS_MODEL_SCHEMA_VERSION;
  entryPlanId: string;
  symbol: string;
  timeframe: string;
  planEligibility: EntryPlanEligibility;
  references: StopLossReference[];
  limitations: string[];
}

export interface StopLossModelBuildResult {
  report: StopLossModelReport;
}
