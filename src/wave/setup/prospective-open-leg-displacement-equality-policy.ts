/**
 * Production prospective target policy (14N-L) — displacement equality only.
 * Not path envelope, Fibonacci, or ATR.
 */

/** Current production policy id for prospective reference targets. */
export const PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY =
  "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY" as const;

/**
 * @deprecated Renamed in 14N-L; persisted alarms or external snapshots may still emit this id.
 * Semantics are identical to {@link PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY}.
 */
export const PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY =
  "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY" as const;

export type ProspectiveOpenLegDisplacementEqualityPolicyId =
  | typeof PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY
  | typeof PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY;

/**
 * Signed displacement from confirmed structural anchor to evaluation close (entry reference).
 */
export interface ProspectiveOpenLegDisplacementEqualityContract {
  policyId: typeof PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY;
  anchorPrice: number;
  entryPrice: number;
  /** entryPrice - anchorPrice */
  signedDisplacement: number;
  /** entryPrice + signedDisplacement === 2 * entryPrice - anchorPrice */
  projectedTargetPrice: number;
}

export function isProspectiveOpenLegDisplacementEqualityPolicyId(
  id: string | null | undefined
): boolean {
  return (
    id === PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY ||
    id === PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY
  );
}

/** Display normalization for legacy persisted policy ids (behavior unchanged). */
export function normalizeProspectiveTargetPolicyId(
  id: string | null | undefined
): string | null {
  if (id == null) {
    return null;
  }
  if (id === PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY) {
    return PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY;
  }
  return id;
}

/**
 * Project the same signed displacement beyond evaluation close.
 * Does not use observedHigh, observedLow, or path envelope.
 */
export function projectProspectiveOpenLegDisplacementEqualityTarget(
  anchorPrice: number,
  entryPrice: number
): number {
  const move = entryPrice - anchorPrice;
  return entryPrice + move;
}

export function describeProspectiveOpenLegDisplacementEqualityContract(
  anchorPrice: number,
  entryPrice: number
): ProspectiveOpenLegDisplacementEqualityContract {
  const signedDisplacement = entryPrice - anchorPrice;
  return {
    policyId: PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY,
    anchorPrice,
    entryPrice,
    signedDisplacement,
    projectedTargetPrice: entryPrice + signedDisplacement,
  };
}
