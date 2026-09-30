import type { FibExtensionLevel } from "../fibonacci";
import type { WaveLabel } from "../types";

/**
 * Pure math contract (14N-B): not objective target policy and not ratio policy.
 * projectionPrice = basePrice + signedReferenceWaveDelta × ratio
 */
export const WAVE_PROJECTION_MATH_CONTRACT_BASE_PLUS_REFERENCE_WAVE_DELTA =
  "BASE_PLUS_REFERENCE_WAVE_DELTA" as const;

export type WaveProjectionMathContract =
  typeof WAVE_PROJECTION_MATH_CONTRACT_BASE_PLUS_REFERENCE_WAVE_DELTA;

export type WaveProjectionBaseAnchorKind =
  | "W1_START"
  | "W1_END"
  | "W2_END"
  | "W3_END"
  | "W4_END"
  | "W5_END";

export type WaveProjectionContextStatus =
  | "NOT_APPLICABLE"
  | "OBJECTIVE_WAVE_UNRESOLVED"
  | "ANCHORS_INSUFFICIENT"
  | "RELATIONSHIPS_AVAILABLE";

export type WaveProjectionRelationshipCandidateStatus =
  | "ANCHORS_AVAILABLE"
  | "INSUFFICIENT_ANCHORS"
  | "ANCHOR_NOT_CONFIRMED"
  | "ANCHOR_TEMPORALLY_INVALID";

export interface WaveProjectionRelationshipCandidate {
  relationshipId: string;
  mathContract: WaveProjectionMathContract;
  referenceWave: WaveLabel;
  baseAnchor: WaveProjectionBaseAnchorKind;
  basePrice: number | null;
  referenceDelta: number | null;
  /** Illustrative only — ratio is policy, never selected here. */
  exampleRatios: readonly FibExtensionLevel[];
  status: WaveProjectionRelationshipCandidateStatus;
  detail: string;
}

/**
 * Per-setup characterization of impulse-continuation Fibonacci projection inputs.
 * Does not select ratio, rank targets, or produce production candidates.
 */
export interface WaveProjectionContext {
  setupId: string;
  currentWaveLabel: WaveLabel;
  /**
   * Set only when derivable from setup/scenario contract without Elliott inference.
   * Impulse-continuation uses scenario wave as the **leading confirmed leg segment**,
   * not as a proven objective (target) wave label.
   */
  objectiveWaveLabel: WaveLabel | null;
  referenceWave: WaveLabel | null;
  baseAnchor: WaveProjectionBaseAnchorKind | null;
  referenceDelta: number | null;
  availableRelationships: WaveProjectionRelationshipCandidate[];
  status: WaveProjectionContextStatus;
  semanticsNote: string;
}
