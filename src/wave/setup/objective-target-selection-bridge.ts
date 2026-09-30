import type { EntryPlanCandidate } from "./entry-plan-types";
import type { ObjectiveTargetCandidate } from "./objective-target-candidate-types";
import type { ObjectiveTargetSelectionResult } from "./objective-target-selection-types";
import type { ReferenceLevel } from "./setup-types";

/**
 * Maps a selected objective target candidate to an explicit reference level
 * for downstream Target Model (STRUCTURAL_TARGET_REFERENCE).
 */
export function objectiveTargetReferenceLevelFromCandidate(
  candidate: ObjectiveTargetCandidate
): ReferenceLevel {
  return {
    kind: "EXPLICIT_OBJECTIVE_TARGET",
    label: `Policy-selected objective target (${candidate.sourceId})`,
    price: candidate.targetPrice,
    note: `objective-target-selection:${candidate.sourceId}:${candidate.referenceSource}`,
  };
}

/**
 * Returns a new Entry Plan with an additional EXPLICIT_OBJECTIVE_TARGET level.
 * Does not mutate the input plan or invent target prices.
 */
export function entryPlanWithSelectedObjectiveTarget(
  plan: EntryPlanCandidate,
  selection: ObjectiveTargetSelectionResult
): EntryPlanCandidate | null {
  if (selection.outcome !== "SELECTED" || !selection.selectedCandidate) {
    return null;
  }
  const candidate = selection.selectedCandidate;
  if (candidate.targetPrice === undefined) {
    return null;
  }
  const level = objectiveTargetReferenceLevelFromCandidate(candidate);
  return {
    ...plan,
    referenceLevels: [
      ...plan.referenceLevels.map((r) => ({ ...r })),
      level,
    ],
    invalidation: {
      ...plan.invalidation,
      conditions: plan.invalidation.conditions.map((c) => ({ ...c })),
    },
    sourceScenario: {
      ...plan.sourceScenario,
      evidence: [...plan.sourceScenario.evidence],
      limitations: [...plan.sourceScenario.limitations],
    },
    limitations: [...plan.limitations],
    evaluationNotes: [...plan.evaluationNotes],
  };
}
