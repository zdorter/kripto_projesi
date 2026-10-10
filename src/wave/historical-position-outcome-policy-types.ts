import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "./historical-position-path-contract";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";

export const HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION =
  "1.0" as const;

export const POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 =
  "POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0" as const;

/** Short label for documentation and reports. */
export const POSITION_OUTCOME_POLICY_DECISIVE_V1_SHORT_NAME =
  "DECISIVE_V1" as const;

export type HistoricalPositionOutcomePolicyId =
  typeof POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;

export const HISTORICAL_POSITION_OUTCOME_POLICY_IDS: readonly HistoricalPositionOutcomePolicyId[] =
  [POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0];

/** Paired with REFERENCE_PATH_V1 position path measurement. */
export const POSITION_OUTCOME_POLICY_REFERENCE_PATH_MODEL_ID: typeof HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 =
  "REFERENCE_PATH_V1";

export type HistoricalPositionPolicyClassification =
  | "FAVORABLE_RESOLUTION"
  | "ADVERSE_RESOLUTION"
  | "INCONCLUSIVE_SAME_BAR"
  | "UNRESOLVED_AT_HORIZON"
  | "UNMEASURED_NO_FUTURE"
  | "UNMEASURED_INSUFFICIENT";

export const HISTORICAL_POSITION_POLICY_CLASSIFICATIONS: readonly HistoricalPositionPolicyClassification[] =
  [
    "FAVORABLE_RESOLUTION",
    "ADVERSE_RESOLUTION",
    "INCONCLUSIVE_SAME_BAR",
    "UNRESOLVED_AT_HORIZON",
    "UNMEASURED_NO_FUTURE",
    "UNMEASURED_INSUFFICIENT",
  ];

export type HistoricalPositionOutcomePolicyDenominatorId =
  | "FILTERED_SNAPSHOTS"
  | "MEASURED_PATHS"
  | "DECISIVE_RESOLUTIONS"
  | "MEASURED_NON_DECISIVE";

export const HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_IDS: readonly HistoricalPositionOutcomePolicyDenominatorId[] =
  [
    "FILTERED_SNAPSHOTS",
    "MEASURED_PATHS",
    "DECISIVE_RESOLUTIONS",
    "MEASURED_NON_DECISIVE",
  ];

/**
 * B-10d mapper signature (implementation deferred to B-10d).
 * Pure, read-only classification of a frozen path result under a policy id.
 */
export type ClassifyHistoricalPositionOutcomePolicy = (
  pathResult: Pick<
    HistoricalPositionPathResult,
    "outcome" | "positionModelId" | "snapshotId"
  >,
  policyId: HistoricalPositionOutcomePolicyId
) => HistoricalPositionPolicyClassification;

export type HistoricalPositionOutcomePolicyPathOutcomeMap = {
  [K in ProspectiveSetupOutcomeReplayStatus]: HistoricalPositionPolicyClassification;
};
