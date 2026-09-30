import type { ReferenceLevelKind } from "./setup-types";
import type { TargetModelId } from "./target-model-types";

export interface TargetModelCatalogEntry {
  modelId: TargetModelId;
  label: string;
  description: string;
}

export const TARGET_MODEL_DEFINITIONS: readonly TargetModelCatalogEntry[] = [
  {
    modelId: "STRUCTURAL_TARGET_REFERENCE",
    label: "Structural objective target reference",
    description:
      "Maps explicit objective target reference levels from Entry Plan snapshot (no projection or RR).",
  },
];

/**
 * Reference kinds that may map to a target reference. Segment endpoints, invalidation,
 * MTF/hierarchy context, and Fibonacci are excluded — structural context only unless listed here.
 *
 * Current scanner/setup pipeline does not emit EXPLICIT_OBJECTIVE_TARGET; real evaluations
 * return INSUFFICIENT_CONTEXT until scan contract supplies objective targets.
 */
export const OBJECTIVE_TARGET_REFERENCE_KINDS: readonly ReferenceLevelKind[] = [
  "EXPLICIT_OBJECTIVE_TARGET",
];

export const TARGET_MODELS_BY_SETUP_TYPE: Readonly<
  Record<string, readonly TargetModelId[]>
> = {
  "impulse-continuation": ["STRUCTURAL_TARGET_REFERENCE"],
  "correction-end": ["STRUCTURAL_TARGET_REFERENCE"],
};

export function listTargetModelsForSetupType(setupTypeId: string): TargetModelId[] {
  return [...(TARGET_MODELS_BY_SETUP_TYPE[setupTypeId] ?? [])];
}

export function getTargetModelDefinition(
  modelId: TargetModelId
): TargetModelCatalogEntry | undefined {
  return TARGET_MODEL_DEFINITIONS.find((e) => e.modelId === modelId);
}

export function isObjectiveTargetReferenceKind(
  kind: ReferenceLevelKind
): boolean {
  return OBJECTIVE_TARGET_REFERENCE_KINDS.includes(kind);
}
