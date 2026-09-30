import type { RiskRewardModelId } from "./risk-reward-model-types";

export interface RiskRewardModelCatalogEntry {
  modelId: RiskRewardModelId;
  label: string;
  description: string;
}

export const RISK_REWARD_MODEL_DEFINITIONS: readonly RiskRewardModelCatalogEntry[] =
  [
    {
      modelId: "REFERENCE_TRIPLET_RISK_REWARD",
      label: "Reference triplet risk/reward",
      description:
        "Computes risk amount, reward amount, and reward/risk ratio from entry, stop, and target references only.",
    },
  ];

export function getRiskRewardModelDefinition(
  modelId: RiskRewardModelId
): RiskRewardModelCatalogEntry | undefined {
  return RISK_REWARD_MODEL_DEFINITIONS.find((e) => e.modelId === modelId);
}
