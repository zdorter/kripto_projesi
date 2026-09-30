import type { SymbolEvaluationBundle } from "./trade-setup-types";

export type StructuralTransitionEvidenceLevel =
  | "NO_TRANSITION"
  | "OPEN_MOVEMENT_ONLY"
  | "SWING_TRANSITION_OBSERVED"
  | "STRUCTURAL_TRANSITION_CONFIRMED";

export const PRODUCTION_TRANSITION_RULE_ID =
  "CONFIRMED_SWING_AFTER_COMPLETED_ENDPOINT" as const;

/**
 * First confirmed swing strictly after completed endpoint index, within evaluation bar.
 * Does not treat the endpoint pivot itself as transition evidence.
 */
export function subsequentConfirmedSwingAfterIndex(
  bundle: SymbolEvaluationBundle,
  afterIndex: number,
  evaluationBarIndex: number
): {
  index: number;
  type: "HIGH" | "LOW";
  price: number;
  swingConfirmationLagBars: number;
} | null {
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const next = swings
    .filter((s) => s.index > afterIndex && s.index <= evaluationBarIndex)
    .sort((a, b) => a.index - b.index)[0];
  if (!next) {
    return null;
  }
  return {
    index: next.index,
    type: next.type,
    price: next.price,
    swingConfirmationLagBars: evaluationBarIndex - next.index,
  };
}

export function characterizeSwingTransitionRelation(input: {
  completedAtIndex: number;
  subsequentSwing: { index: number; type: "HIGH" | "LOW" };
}): {
  swingAfterEndpoint: true;
  indexStrictlyAfterCompleted: boolean;
  withinEvaluationBar: boolean;
  /** Observed swing type only — not Elliott continuation/correction inference. */
  subsequentSwingType: "HIGH" | "LOW";
  notes: string[];
} {
  const { completedAtIndex, subsequentSwing } = input;
  const notes: string[] = [
    "Transition swing is first confirmed swing with index > completed endpoint.",
    "Swing type is structural characterization only (not Elliott phase label).",
  ];
  if (subsequentSwing.index <= completedAtIndex) {
    notes.push("Swing index is not strictly after completed endpoint.");
  }
  return {
    swingAfterEndpoint: true,
    indexStrictlyAfterCompleted: subsequentSwing.index > completedAtIndex,
    withinEvaluationBar: true,
    subsequentSwingType: subsequentSwing.type,
    notes,
  };
}

export function resolveStructuralTransitionEvidenceLevel(input: {
  subsequentSwingObserved: boolean;
  openMovementObserved: boolean;
  phaseInProgress: boolean;
}): StructuralTransitionEvidenceLevel {
  if (input.phaseInProgress && input.subsequentSwingObserved) {
    return "STRUCTURAL_TRANSITION_CONFIRMED";
  }
  if (input.subsequentSwingObserved) {
    return "SWING_TRANSITION_OBSERVED";
  }
  if (input.openMovementObserved) {
    return "OPEN_MOVEMENT_ONLY";
  }
  return "NO_TRANSITION";
}
