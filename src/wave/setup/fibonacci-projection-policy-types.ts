import type { FibExtensionLevel } from "../fibonacci";
import type { WaveLabel } from "../types";
import type { FibonacciProjectionAnchorModel } from "./fibonacci-anchor-semantics-types";

export const FIBONACCI_PROJECTION_POLICY_SCHEMA_VERSION = "1.1" as const;

/**
 * Where the projection ratio rule is defined (not probability or recommendation).
 */
export type FibonacciProjectionPolicyProvenance =
  | "ENGINE_CONTRACT"
  | "CONFIGURED_POLICY"
  | "CALLER_POLICY";

/**
 * Explicit ratio selection — no implicit defaults, nearestMatch, or first-ratio fallbacks.
 */
export type FibonacciProjectionRatioSelectionRule =
  | {
      kind: "SINGLE_EXPLICIT";
      ratio: FibExtensionLevel;
    }
  | {
      kind: "BY_WAVE_LABEL";
      mapping: Readonly<Partial<Record<WaveLabel, FibExtensionLevel>>>;
      /** Required when mapping omits a label — must not guess. */
      fallback: "NONE";
    };

export interface FibonacciObjectiveTargetProjectionPolicy {
  schemaVersion: typeof FIBONACCI_PROJECTION_POLICY_SCHEMA_VERSION;
  policyId: string;
  policyVersion: string;
  provenance: FibonacciProjectionPolicyProvenance;
  applicableSetupTypes: readonly string[];
  applicableWaveLabels?: readonly WaveLabel[];
  /** Required explicit anchor semantics — no implicit MODEL A default. */
  anchorModel: FibonacciProjectionAnchorModel;
  allowedRatios: readonly FibExtensionLevel[];
  selectionRule: FibonacciProjectionRatioSelectionRule;
}

export type FibonacciProjectionPolicyStatus =
  | "POLICY_READY"
  | "TARGET_RATIO_POLICY_MISSING"
  | "POLICY_NOT_APPLICABLE"
  | "AMBIGUOUS_PROJECTION_POLICY"
  | "ANCHORS_UNAVAILABLE"
  | "ANCHOR_TEMPORALLY_INVALID"
  | "ANCHOR_MODEL_UNSUPPORTED"
  | "PROJECTION_FORMULA_UNAVAILABLE";

export interface FibonacciProjectionPolicyResolution {
  status: FibonacciProjectionPolicyStatus;
  policyId: string | null;
  selectedRatio: FibExtensionLevel | null;
  rangeStartPrice: number | null;
  rangeEndPrice: number | null;
  projectionPrice: number | null;
  detail: string;
  policy?: FibonacciObjectiveTargetProjectionPolicy;
}
