import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP } from "./historical-position-outcome-policy-contract";
import {
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
  type HistoricalPositionOutcomePolicyId,
  type HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";

export type HistoricalPositionOutcomePolicyMapperErrorCode =
  "UNSUPPORTED_POLICY_ID";

export class HistoricalPositionOutcomePolicyMapperError extends Error {
  readonly code: HistoricalPositionOutcomePolicyMapperErrorCode;
  readonly policyId: string;

  constructor(
    code: HistoricalPositionOutcomePolicyMapperErrorCode,
    policyId: string,
    message?: string
  ) {
    super(
      message ??
        `Unsupported historical position outcome policy: ${policyId}`
    );
    this.name = "HistoricalPositionOutcomePolicyMapperError";
    this.code = code;
    this.policyId = policyId;
  }
}

export interface HistoricalPositionOutcomePolicyClassificationResult {
  policyId: HistoricalPositionOutcomePolicyId;
  classification: HistoricalPositionPolicyClassification;
}

/**
 * B-10d: map a frozen B-10a path outcome to a B-10c policy classification.
 * Uses `pathResult.outcome` only; does not replay or re-measure.
 */
export function classifyHistoricalPositionOutcomePolicy(
  pathResult: HistoricalPositionPathResult,
  policyId?: HistoricalPositionOutcomePolicyId
): HistoricalPositionOutcomePolicyClassificationResult {
  const resolvedPolicyId =
    policyId ?? POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;

  if (
    resolvedPolicyId !== POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
  ) {
    throw new HistoricalPositionOutcomePolicyMapperError(
      "UNSUPPORTED_POLICY_ID",
      resolvedPolicyId
    );
  }

  const classification =
    POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP[
      pathResult.outcome
    ];

  return {
    policyId: resolvedPolicyId,
    classification,
  };
}
