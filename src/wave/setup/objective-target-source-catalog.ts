import type { ObjectiveTargetSourceId } from "./objective-target-candidate-types";

export interface ObjectiveTargetSourceCatalogEntry {
  sourceId: ObjectiveTargetSourceId;
  label: string;
  description: string;
}

/** Catalog order defines deterministic candidate ordering (not quality ranking). */
export const OBJECTIVE_TARGET_SOURCE_DEFINITIONS: readonly ObjectiveTargetSourceCatalogEntry[] =
  [
    {
      sourceId: "ABC_PROJECTION",
      label: "ABC projection",
      description:
        "Correction ABC objective target from attested A/B/C geometry (not from Wave C label alone).",
    },
    {
      sourceId: "FIBONACCI_PROJECTION",
      label: "Fibonacci extension projection",
      description:
        "Extension price from attested leg anchors via fibExtensionPrice (not W1–W2 retracement conformance).",
    },
    {
      sourceId: "PREVIOUS_SWING",
      label: "Confirmed swing at segment origin",
      description:
        "Confirmed swing price at scenario segment start index from diagnostics snapshot.",
    },
    {
      sourceId: "WAVE_STRUCTURE",
      label: "Wave structure objective",
      description:
        "Attested structure-derived target price; wave labels alone do not produce candidates.",
    },
  ];

export const OBJECTIVE_TARGET_SOURCES_BY_SETUP_TYPE: Readonly<
  Record<string, readonly ObjectiveTargetSourceId[]>
> = {
  "impulse-continuation": [
    "FIBONACCI_PROJECTION",
    "PREVIOUS_SWING",
    "WAVE_STRUCTURE",
  ],
  "correction-end": [
    "ABC_PROJECTION",
    "FIBONACCI_PROJECTION",
    "PREVIOUS_SWING",
    "WAVE_STRUCTURE",
  ],
};

export function listObjectiveTargetSourcesForSetupType(
  setupTypeId: string
): ObjectiveTargetSourceId[] {
  return [...(OBJECTIVE_TARGET_SOURCES_BY_SETUP_TYPE[setupTypeId] ?? [])];
}

export function getObjectiveTargetSourceDefinition(
  sourceId: ObjectiveTargetSourceId
): ObjectiveTargetSourceCatalogEntry | undefined {
  return OBJECTIVE_TARGET_SOURCE_DEFINITIONS.find(
    (e) => e.sourceId === sourceId
  );
}

export function isObjectiveTargetSourceApplicable(
  setupTypeId: string,
  sourceId: ObjectiveTargetSourceId
): boolean {
  return listObjectiveTargetSourcesForSetupType(setupTypeId).includes(sourceId);
}
