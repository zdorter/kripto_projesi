import type { EntryPriceReference } from "./entry-model-types";
import type { StopLossReference } from "./stop-loss-model-types";
import type { TargetReference } from "./target-model-types";
import type { SetupDirectionalBias } from "./setup-types";

export const RISK_REWARD_MODEL_SCHEMA_VERSION = "1.0" as const;

export type RiskRewardModelId = "REFERENCE_TRIPLET_RISK_REWARD";

export type RiskRewardReferenceOutcome =
  | "RR_REFERENCE_AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

export interface RiskRewardModelEvaluateInput {
  entry?: EntryPriceReference;
  stop?: StopLossReference;
  target?: TargetReference;
}

/**
 * Mathematical risk/reward from reference prices — not trade quality or a signal.
 */
export interface RiskRewardReference {
  schemaVersion: typeof RISK_REWARD_MODEL_SCHEMA_VERSION;
  modelId: RiskRewardModelId;
  modelLabel: string;
  outcome: RiskRewardReferenceOutcome;
  entryPlanId?: string;
  setupTypeId?: string;
  directionalBias: SetupDirectionalBias | null;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  riskAmount?: number;
  rewardAmount?: number;
  riskRewardRatio?: number;
  rationale: string;
  limitations: string[];
}

export interface RiskRewardModelReport {
  schemaVersion: typeof RISK_REWARD_MODEL_SCHEMA_VERSION;
  references: RiskRewardReference[];
  limitations: string[];
}

export interface RiskRewardModelBuildResult {
  report: RiskRewardModelReport;
}
