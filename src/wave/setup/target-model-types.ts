import type { EntryPlanCandidate, EntryPlanEligibility } from "./entry-plan-types";
import type {
  ReferenceLevelKind,
  SetupDirectionalBias,
} from "./setup-types";

export const TARGET_MODEL_SCHEMA_VERSION = "1.0" as const;

export type TargetModelId = "STRUCTURAL_TARGET_REFERENCE";

export type TargetReferenceOutcome =
  | "TARGET_REFERENCE_AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

export interface TargetModelEvaluateInput {
  plan: EntryPlanCandidate;
}

/**
 * Target price reference — not an executable take-profit order.
 */
export interface TargetReference {
  schemaVersion: typeof TARGET_MODEL_SCHEMA_VERSION;
  modelId: TargetModelId;
  modelLabel: string;
  outcome: TargetReferenceOutcome;
  entryPlanId: string;
  setupTypeId: string;
  directionalBias: SetupDirectionalBias | null;
  targetPrice?: number;
  referenceKind?: ReferenceLevelKind;
  referenceSource: string;
  rationale: string;
  limitations: string[];
}

export interface TargetModelReport {
  schemaVersion: typeof TARGET_MODEL_SCHEMA_VERSION;
  entryPlanId: string;
  symbol: string;
  timeframe: string;
  planEligibility: EntryPlanEligibility;
  references: TargetReference[];
  limitations: string[];
}

export interface TargetModelBuildResult {
  report: TargetModelReport;
}
