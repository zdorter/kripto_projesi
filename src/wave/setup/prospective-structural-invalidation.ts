import type { SetupCandidate } from "./setup-types";

/**
 * Prospective structural invalidation: finite scenario reference, not triggered, not a stop order.
 */
export function resolveProspectiveStructuralInvalidation(setup: SetupCandidate): {
  available: boolean;
  triggered: boolean;
  invalidationPrice: number | null;
} {
  const triggered = setup.invalidation.conditions.some(
    (c) =>
      c.conditionId === "setup-invalidation-triggered" && c.outcome === "MET"
  );
  const ref = setup.referenceLevels.find(
    (l) => l.kind === "SCENARIO_INVALIDATION"
  );
  const invalidationPrice =
    ref?.price !== undefined && Number.isFinite(ref.price) ? ref.price : null;
  const available =
    setup.invalidation.usesScenarioInvalidation &&
    !triggered &&
    invalidationPrice !== null;
  return { available, triggered, invalidationPrice };
}
