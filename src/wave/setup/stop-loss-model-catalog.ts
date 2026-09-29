import type { StopLossModelId } from "./stop-loss-model-types";

export interface StopLossModelCatalogEntry {
  modelId: StopLossModelId;
  label: string;
  description: string;
}

export const STOP_LOSS_MODEL_DEFINITIONS: readonly StopLossModelCatalogEntry[] = [
  {
    modelId: "SCENARIO_INVALIDATION_REFERENCE",
    label: "Scenario invalidation reference",
    description:
      "Stop reference equals scenario structural invalidation price from Entry Plan snapshot (no buffer or adjustment).",
  },
];

export const STOP_LOSS_MODELS_BY_SETUP_TYPE: Readonly<
  Record<string, readonly StopLossModelId[]>
> = {
  "impulse-continuation": ["SCENARIO_INVALIDATION_REFERENCE"],
  "correction-end": ["SCENARIO_INVALIDATION_REFERENCE"],
};

export function listStopLossModelsForSetupType(
  setupTypeId: string
): StopLossModelId[] {
  return [...(STOP_LOSS_MODELS_BY_SETUP_TYPE[setupTypeId] ?? [])];
}

export function getStopLossModelDefinition(
  modelId: StopLossModelId
): StopLossModelCatalogEntry | undefined {
  return STOP_LOSS_MODEL_DEFINITIONS.find((e) => e.modelId === modelId);
}
