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
      "SEGMENT_ENVELOPE_SCENARIO_INVALIDATION_REFERENCE: stop price equals scenario invalidation when it lies outside the setup segment envelope (no buffer or adjustment).",
  },
  {
    modelId: "TRACK_SCOPE_INVALIDATION_REFERENCE",
    label: "Track-scope invalidation reference",
    description:
      "Structural stop reference when selected scenario invalidation source is TRACK_SCOPE and price is on the risk side of the entry reference (not segment-envelope geometry).",
  },
];

export const STOP_LOSS_MODELS_BY_SETUP_TYPE: Readonly<
  Record<string, readonly StopLossModelId[]>
> = {
  "impulse-continuation": [
    "SCENARIO_INVALIDATION_REFERENCE",
    "TRACK_SCOPE_INVALIDATION_REFERENCE",
  ],
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
