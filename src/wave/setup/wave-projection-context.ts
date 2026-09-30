import type { FibExtensionLevel } from "../fibonacci";
import { FIB_EXTENSION_LEVELS } from "../fibonacci";
import type { WaveLabel } from "../types";
import type { WaveLegDiagnostic } from "../wave-diagnostics";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type {
  WaveProjectionBaseAnchorKind,
  WaveProjectionContext,
  WaveProjectionContextStatus,
  WaveProjectionRelationshipCandidate,
  WaveProjectionRelationshipCandidateStatus,
} from "./wave-projection-relationship-types";
import { WAVE_PROJECTION_MATH_CONTRACT_BASE_PLUS_REFERENCE_WAVE_DELTA } from "./wave-projection-relationship-types";

const EXAMPLE_RATIOS: readonly FibExtensionLevel[] = FIB_EXTENSION_LEVELS;

const IMPULSE_CONTINUATION_PHASE: readonly WaveLabel[] = ["3", "4", "5"];

interface RelationshipTemplate {
  relationshipId: string;
  referenceWave: WaveLabel;
  baseAnchor: WaveProjectionBaseAnchorKind;
}

const W3_CONTEXT_TEMPLATES: readonly RelationshipTemplate[] = [
  {
    relationshipId: "W3_CONTEXT_REF_W1_BASE_W2_END",
    referenceWave: "1",
    baseAnchor: "W2_END",
  },
];

const W5_CONTEXT_TEMPLATES: readonly RelationshipTemplate[] = [
  {
    relationshipId: "W5_CONTEXT_REF_W1_BASE_W4_END",
    referenceWave: "1",
    baseAnchor: "W4_END",
  },
  {
    relationshipId: "W5_CONTEXT_REF_W3_BASE_W4_END",
    referenceWave: "3",
    baseAnchor: "W4_END",
  },
];

function templatesForCurrentWave(
  currentWaveLabel: WaveLabel
): readonly RelationshipTemplate[] {
  switch (currentWaveLabel) {
    case "3":
      return W3_CONTEXT_TEMPLATES;
    case "5":
      return W5_CONTEXT_TEMPLATES;
    case "4":
      return [];
    default:
      return [];
  }
}

function selectedImpulseLeg(
  waveLegs: WaveLegDiagnostic[],
  label: WaveLabel
): WaveLegDiagnostic | undefined {
  return waveLegs.find(
    (l) =>
      l.structure === "IMPULSE" &&
      l.scenario === "SELECTED" &&
      l.label === label
  );
}

function waveConfirmedAtBar(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel,
  evaluationBarIndex: number
): boolean {
  const w = bundle.presentation.engine.flatWaves.find((x) => x.label === label);
  if (!w || w.status !== "CONFIRMED") {
    return false;
  }
  return w.endIndex <= evaluationBarIndex;
}

function anchorKindToLeg(
  kind: WaveProjectionBaseAnchorKind
): { label: WaveLabel; end: boolean } | null {
  switch (kind) {
    case "W1_START":
      return { label: "1", end: false };
    case "W1_END":
      return { label: "1", end: true };
    case "W2_END":
      return { label: "2", end: true };
    case "W3_END":
      return { label: "3", end: true };
    case "W4_END":
      return { label: "4", end: true };
    case "W5_END":
      return { label: "5", end: true };
    default:
      return null;
  }
}

function priceForAnchor(
  waveLegs: WaveLegDiagnostic[],
  kind: WaveProjectionBaseAnchorKind
): number | null {
  const spec = anchorKindToLeg(kind);
  if (!spec) {
    return null;
  }
  const leg = selectedImpulseLeg(waveLegs, spec.label);
  if (!leg) {
    return null;
  }
  const price = spec.end ? leg.endPrice : leg.startPrice;
  return Number.isFinite(price) ? price : null;
}

function referenceDeltaForWave(
  waveLegs: WaveLegDiagnostic[],
  referenceWave: WaveLabel
): number | null {
  const leg = selectedImpulseLeg(waveLegs, referenceWave);
  if (!leg) {
    return null;
  }
  const delta = leg.endPrice - leg.startPrice;
  return Number.isFinite(delta) ? delta : null;
}

function legIndexForAnchor(
  waveLegs: WaveLegDiagnostic[],
  kind: WaveProjectionBaseAnchorKind
): number | null {
  const spec = anchorKindToLeg(kind);
  if (!spec) {
    return null;
  }
  const leg = selectedImpulseLeg(waveLegs, spec.label);
  if (!leg) {
    return null;
  }
  return spec.end ? leg.endIndex : leg.startIndex;
}

function characterizeRelationship(
  template: RelationshipTemplate,
  waveLegs: WaveLegDiagnostic[],
  bundle: SymbolEvaluationBundle,
  evaluationBarIndex: number
): WaveProjectionRelationshipCandidate {
  const basePrice = priceForAnchor(waveLegs, template.baseAnchor);
  const referenceDelta = referenceDeltaForWave(
    waveLegs,
    template.referenceWave
  );
  const baseIndex = legIndexForAnchor(waveLegs, template.baseAnchor);
  const refLeg = selectedImpulseLeg(waveLegs, template.referenceWave);

  let status: WaveProjectionRelationshipCandidateStatus = "ANCHORS_AVAILABLE";
  let detail = "Reference wave leg and base anchor prices available from SELECTED impulse diagnostics.";

  if (basePrice === null || referenceDelta === null || !refLeg) {
    status = "INSUFFICIENT_ANCHORS";
    detail = "Missing SELECTED impulse leg price for reference wave or base anchor.";
  } else if (
    !waveConfirmedAtBar(bundle, template.referenceWave, evaluationBarIndex) ||
    !waveConfirmedAtBar(
      bundle,
      anchorKindToLeg(template.baseAnchor)!.label,
      evaluationBarIndex
    )
  ) {
    status = "ANCHOR_NOT_CONFIRMED";
    detail =
      "Reference or base leg not CONFIRMED at or before evaluation bar in engine snapshot.";
  } else if (
    (baseIndex !== null && baseIndex > evaluationBarIndex) ||
    refLeg.endIndex > evaluationBarIndex
  ) {
    status = "ANCHOR_TEMPORALLY_INVALID";
    detail = "Anchor index exceeds evaluationBarIndex.";
  }

  return {
    relationshipId: template.relationshipId,
    mathContract: WAVE_PROJECTION_MATH_CONTRACT_BASE_PLUS_REFERENCE_WAVE_DELTA,
    referenceWave: template.referenceWave,
    baseAnchor: template.baseAnchor,
    basePrice,
    referenceDelta,
    exampleRatios: EXAMPLE_RATIOS,
    status,
    detail,
  };
}

function resolveObjectiveWaveLabel(
  _plan: EntryPlanCandidate
): WaveLabel | null {
  return null;
}

function semanticsNoteFor(currentWaveLabel: WaveLabel): string {
  switch (currentWaveLabel) {
    case "3":
      return "Scenario waveLabel is the leading confirmed impulse leg (W3 segment). It is not a deterministic objective (target) wave label in engine contract.";
    case "4":
      return "Scenario waveLabel is the W4 correction leg segment (sourceScenario). Objective phase (e.g. W5) is not inferred automatically.";
    case "5":
      return "Scenario waveLabel is the W5 leg segment. Reference/base relationship templates are W5-context only; not shared with W3/W4 setups.";
    default:
      return "Not an impulse-continuation phase label.";
  }
}

export function resolveWaveProjectionContext(
  plan: EntryPlanCandidate,
  bundle: SymbolEvaluationBundle
): WaveProjectionContext {
  const currentWaveLabel = plan.scenarioRef.waveLabel;
  const evaluationBarIndex = plan.evaluationBar.evaluationBarIndex;

  if (plan.setupTypeId !== "impulse-continuation") {
    return {
      setupId: plan.setupRef.setupId,
      currentWaveLabel,
      objectiveWaveLabel: null,
      referenceWave: null,
      baseAnchor: null,
      referenceDelta: null,
      availableRelationships: [],
      status: "NOT_APPLICABLE",
      semanticsNote: `Setup type ${plan.setupTypeId} is outside impulse-continuation projection characterization.`,
    };
  }

  if (!IMPULSE_CONTINUATION_PHASE.includes(currentWaveLabel)) {
    return {
      setupId: plan.setupRef.setupId,
      currentWaveLabel,
      objectiveWaveLabel: null,
      referenceWave: null,
      baseAnchor: null,
      referenceDelta: null,
      availableRelationships: [],
      status: "NOT_APPLICABLE",
      semanticsNote: semanticsNoteFor(currentWaveLabel),
    };
  }

  const objectiveWaveLabel = resolveObjectiveWaveLabel(plan);
  const waveLegs = bundle.diagnostics.waveLegs ?? [];
  const templates = templatesForCurrentWave(currentWaveLabel);
  const availableRelationships = templates.map((t) =>
    characterizeRelationship(t, waveLegs, bundle, evaluationBarIndex)
  );

  let status: WaveProjectionContextStatus = "OBJECTIVE_WAVE_UNRESOLVED";
  if (currentWaveLabel === "4") {
    status = "OBJECTIVE_WAVE_UNRESOLVED";
  } else if (templates.length === 0) {
    status = "ANCHORS_INSUFFICIENT";
  } else if (
    availableRelationships.some((r) => r.status === "ANCHORS_AVAILABLE")
  ) {
    status = "RELATIONSHIPS_AVAILABLE";
  } else {
    status = "ANCHORS_INSUFFICIENT";
  }

  return {
    setupId: plan.setupRef.setupId,
    currentWaveLabel,
    objectiveWaveLabel,
    referenceWave: null,
    baseAnchor: null,
    referenceDelta: null,
    availableRelationships,
    status,
    semanticsNote: semanticsNoteFor(currentWaveLabel),
  };
}
