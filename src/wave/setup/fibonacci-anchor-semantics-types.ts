import type { FibExtensionLevel } from "../fibonacci";

/**
 * Explicit anchor semantics for Fibonacci objective projection (Phase B).
 * Not interchangeable — each model implies different price bases.
 */
export type FibonacciProjectionAnchorModel =
  | "DIAGNOSTICS_W1_LEG_RANGE"
  | "W2_END_BASED_W1_DELTA";

/**
 * Where a projection rule is scoped in the engine (metadata only in 14M).
 */
export type FibonacciProjectionScope =
  | "TRACK_SCOPE"
  | "WAVE_SEQUENCE_SCOPE"
  | "SETUP_SEGMENT_SCOPE";

export type FibonacciAnchorModelSupportVerdict =
  | "SUPPORTED_BY_EXISTING_CONTRACT"
  | "MATHEMATICALLY_POSSIBLE"
  | "REQUIRES_DOMAIN_POLICY"
  | "UNSUPPORTED";

export const FIBONACCI_DIAGNOSTIC_PROJECTION_RATIOS: readonly FibExtensionLevel[] =
  [1.0, 1.272, 1.618];
