/** Historical position path measurement (Phase B-10a) — reference path only, not execution. */

export const HISTORICAL_POSITION_PATH_SCHEMA_VERSION = "1.0" as const;

/**
 * Position path model aligned with B-6 prospective setup outcome replay.
 * Not an executable order, fill, or account simulation model.
 */
export const HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 =
  "REFERENCE_PATH_V1" as const;

export const HISTORICAL_POSITION_PATH_REFERENCE_V1_LIMITATIONS: readonly string[] =
  [
    "REFERENCE_PATH_V1 evaluates a hypothetical price path from frozen evaluation references.",
    "Entry is the prospective evaluation close reference at bar E; this is not an exchange fill claim.",
    "Target and invalidation levels are objective references from the evaluation snapshot, not take-profit or stop orders.",
    "Outcome semantics match B-6 replay (touch-based, no intrabar ordering, no gap fill simulation).",
    "Position path does not imply WIN, LOSS, PnL, or trade recommendation.",
  ];
