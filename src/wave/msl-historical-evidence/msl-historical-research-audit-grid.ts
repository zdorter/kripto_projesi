/** Documented MSL-14 evaluation grid (frozen 1H research; no silent changes). */
export const MSL_14_V1_AUDIT_GRID_ID = "MSL-14-V1-REPRESENTATIVE-1H-FROZEN" as const;

export const MSL_14_V1_OBSERVATION_HORIZON_BARS = [4, 8, 12, 24, 48] as const;

/**
 * Representative E grid: every 300 bars from 150 through 2850 (inclusive).
 * Chosen so E + max(H=48) stays within typical frozen 1H candle count (~3000).
 */
export const MSL_14_V1_EVALUATION_INDICES: readonly number[] = Array.from(
  { length: 10 },
  (_, i) => 150 + i * 300
);

export interface Msl14AuditGridSpecV1 {
  gridId: typeof MSL_14_V1_AUDIT_GRID_ID;
  observationHorizonBars: readonly number[];
  evaluationIndices: readonly number[];
  documentation: string;
}

export function msl14V1AuditGridSpec(): Msl14AuditGridSpecV1 {
  return {
    gridId: MSL_14_V1_AUDIT_GRID_ID,
    observationHorizonBars: [...MSL_14_V1_OBSERVATION_HORIZON_BARS],
    evaluationIndices: [...MSL_14_V1_EVALUATION_INDICES],
    documentation:
      "MSL-14 v1 representative grid: explicit E list (150..2850 step 300), horizons 4/8/12/24/48, frozen manifest symbols only.",
  };
}
