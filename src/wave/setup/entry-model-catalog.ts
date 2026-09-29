import type { EntryModelId } from "./entry-model-types";

export interface EntryModelCatalogEntry {
  modelId: EntryModelId;
  label: string;
  description: string;
}

export const ENTRY_MODEL_DEFINITIONS: readonly EntryModelCatalogEntry[] = [
  {
    modelId: "EVALUATION_CLOSE",
    label: "Evaluation bar close",
    description:
      "Reference price is the close of the established closed evaluation bar (not a market order).",
  },
  {
    modelId: "SEGMENT_ENDPOINT",
    label: "Scenario segment endpoint",
    description:
      "Reference price is the scenario segment end from scan snapshot when end index is at or before the evaluation bar.",
  },
];

/**
 * Entry models supported per trade setup type.
 * BREAKOUT_REFERENCE, PULLBACK_REFERENCE, FIBONACCI_REFERENCE: deferred (no objective rules in architecture).
 */
export const ENTRY_MODELS_BY_SETUP_TYPE: Readonly<
  Record<string, readonly EntryModelId[]>
> = {
  "impulse-continuation": ["EVALUATION_CLOSE", "SEGMENT_ENDPOINT"],
  "correction-end": ["EVALUATION_CLOSE", "SEGMENT_ENDPOINT"],
};

export function listEntryModelsForSetupType(
  setupTypeId: string
): EntryModelId[] {
  return [...(ENTRY_MODELS_BY_SETUP_TYPE[setupTypeId] ?? [])];
}

export function getEntryModelDefinition(
  modelId: EntryModelId
): EntryModelCatalogEntry | undefined {
  return ENTRY_MODEL_DEFINITIONS.find((e) => e.modelId === modelId);
}
