import type { ObjectiveTargetSelectionPolicy } from "./objective-target-selection-types";

/**
 * Default policy: fixed source precedence order (not target quality).
 * Order differs from OBJECTIVE_TARGET_SOURCE_DEFINITIONS catalog listing.
 */
export const DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY: ObjectiveTargetSelectionPolicy =
  {
    policyId: "SOURCE_PRECEDENCE",
    policyVersion: "1.0",
    sourcePrecedence: [
      "FIBONACCI_PROJECTION",
      "PREVIOUS_SWING",
      "WAVE_STRUCTURE",
      "ABC_PROJECTION",
    ],
    requiresDirectionalBias: true,
  };
