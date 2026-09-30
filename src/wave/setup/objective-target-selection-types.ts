import type { ObjectiveTargetCandidate, ObjectiveTargetCandidateReport } from "./objective-target-candidate-types";
import type { ObjectiveTargetSourceId } from "./objective-target-candidate-types";

export const OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION = "1.0" as const;

/**
 * Deterministic source precedence — not a quality or profitability ranking.
 */
export interface ObjectiveTargetSelectionPolicy {
  policyId: "SOURCE_PRECEDENCE";
  policyVersion: "1.0";
  /**
   * First matching AVAILABLE candidate by source wins (precedence, not quality).
   */
  sourcePrecedence: readonly ObjectiveTargetSourceId[];
  /** When true, AVAILABLE candidates without directionalBias cannot be selected. */
  requiresDirectionalBias: boolean;
}

export type ObjectiveTargetSelectionOutcome =
  | "SELECTED"
  | "NO_SELECTION"
  | "INSUFFICIENT_CONTEXT";

export interface ObjectiveTargetSelectionInput {
  report: ObjectiveTargetCandidateReport;
  policy?: ObjectiveTargetSelectionPolicy;
}

export interface ObjectiveTargetSelectionResult {
  schemaVersion: typeof OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION;
  outcome: ObjectiveTargetSelectionOutcome;
  policyId: ObjectiveTargetSelectionPolicy["policyId"];
  policyVersion: ObjectiveTargetSelectionPolicy["policyVersion"];
  entryPlanId: string;
  setupId: string;
  setupTypeId: string;
  symbol: string;
  timeframe: string;
  scenarioId: string;
  selectedCandidate: ObjectiveTargetCandidate | null;
  selectionReason: string;
  limitations: string[];
}
