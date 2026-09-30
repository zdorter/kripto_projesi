import type { WaveLabel } from "../types";
import {
  buildNextStructuralEvidence,
  characterizeImpulseLegAtBar,
} from "./objective-wave-resolution";
import type { SetupCandidate } from "./setup-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type {
  ObjectiveEligibility,
  ObjectivePhaseContext,
  ProspectiveSetupSupportVerdict,
  StructuralTransitionEvidence,
  TradeSetupSemanticKind,
  TradeSetupTemporalClass,
  TradeSetupTemporalContext,
} from "./trade-setup-temporal-types";
import { TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT } from "./trade-setup-temporal-types";

function semanticKindForSetupType(setupTypeId: string): TradeSetupSemanticKind {
  switch (setupTypeId) {
    case "impulse-continuation":
      return "IMPULSE_FOCUS_LEG_ENDPOINT_CONFIRMATION";
    case "correction-end":
      return "CORRECTIVE_C_LEG_ENDPOINT_CONFIRMATION";
    default:
      return "STRUCTURAL_CONTEXT_ONLY";
  }
}

function correctiveLegAtBar(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel,
  evaluationBarIndex: number
): { state: string; endIndex: number | null } {
  const leg = bundle.diagnostics.waveLegs.find(
    (l) => l.structure === "CORRECTIVE" && l.label === label
  );
  const w = bundle.presentation?.engine?.flatWaves?.find((x) => x.label === label);
  if (!leg && !w) {
    return { state: "NOT_PRESENT", endIndex: null };
  }
  const startIndex = leg?.startIndex ?? w?.startIndex ?? 0;
  const endIndex = leg?.endIndex ?? w?.endIndex ?? null;
  if (endIndex === null) {
    return { state: "INSUFFICIENT_CONTEXT", endIndex: null };
  }
  if (startIndex > evaluationBarIndex) {
    return { state: "NOT_STARTED", endIndex };
  }
  if (endIndex > evaluationBarIndex) {
    return { state: "IN_PROGRESS", endIndex };
  }
  const status = w?.status ?? leg?.status;
  if (status === "CONFIRMED") {
    return { state: "ENDPOINT_CONFIRMED", endIndex };
  }
  return { state: "IN_PROGRESS", endIndex };
}

function focusWaveState(
  setup: SetupCandidate,
  bundle: SymbolEvaluationBundle,
  evaluationBarIndex: number
): { state: string; endIndex: number | null } {
  const focus = setup.scenarioRef.waveLabel;
  if (setup.scenarioRef.structure === "CORRECTIVE" || setup.setupTypeId === "correction-end") {
    return correctiveLegAtBar(bundle, focus, evaluationBarIndex);
  }
  return characterizeImpulseLegAtBar(bundle, focus, evaluationBarIndex);
}

function temporalClassFromFocusState(
  setup: SetupCandidate,
  focusState: string
): TradeSetupTemporalClass {
  if (!setup.isTradeSetup) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (focusState === "ENDPOINT_CONFIRMED") {
    return "HISTORICAL_STRUCTURE";
  }
  if (focusState === "IN_PROGRESS") {
    return "CURRENT_STRUCTURE";
  }
  if (focusState === "NOT_STARTED" || focusState === "NOT_PRESENT") {
    return "INSUFFICIENT_CONTEXT";
  }
  return "INSUFFICIENT_CONTEXT";
}

function resolveObjectiveEligibility(
  setup: SetupCandidate,
  bundle: SymbolEvaluationBundle,
  focusState: string,
  temporalClass: TradeSetupTemporalClass
): ObjectiveEligibility {
  if (!setup.isTradeSetup || setup.status === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (setup.status !== "CONFIRMED" && setup.status !== "CANDIDATE") {
    return "INSUFFICIENT_CONTEXT";
  }

  if (setup.setupTypeId === "impulse-continuation") {
    if (focusState === "ENDPOINT_CONFIRMED") {
      return "OBJECTIVE_ALREADY_COMPLETED";
    }
    if (focusState === "IN_PROGRESS") {
      return "OBJECTIVE_UNRESOLVED";
    }
    return "NOT_PROSPECTIVE";
  }

  if (setup.setupTypeId === "correction-end") {
    if (focusState === "ENDPOINT_CONFIRMED") {
      return "OBJECTIVE_ALREADY_COMPLETED";
    }
    if (focusState === "IN_PROGRESS") {
      return "OBJECTIVE_UNRESOLVED";
    }
    return "NOT_PROSPECTIVE";
  }

  if (temporalClass === "PROSPECTIVE_STRUCTURE") {
    return "ELIGIBLE";
  }
  return "NOT_PROSPECTIVE";
}

function buildTransitionEvidence(
  setup: SetupCandidate,
  bundle: SymbolEvaluationBundle,
  evaluationBarIndex: number
): StructuralTransitionEvidence {
  const notes: string[] = [];
  const focus = setup.scenarioRef.waveLabel;
  let next = {
    nextImpulseLegLabel: null as WaveLabel | null,
    nextLegStartIndexAtOrBeforeBar: false,
    nextLegEndConfirmedAtOrBeforeBar: false,
    nextLegStartIndex: null as number | null,
    nextLegEndIndex: null as number | null,
  };
  if (
    setup.setupTypeId === "impulse-continuation" &&
    (focus === "3" || focus === "4" || focus === "5")
  ) {
    next = buildNextStructuralEvidence(
      bundle,
      focus,
      evaluationBarIndex
    );
  }
  if (setup.setupTypeId === "correction-end") {
    notes.push(
      "Correction-end does not establish new impulse start; correction ended ≠ next impulse started."
    );
  }

  const focusEnd = focusWaveState(setup, bundle, evaluationBarIndex).endIndex;
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const oppositeSwingAfterFocusEnd =
    focusEnd !== null &&
    swings.some(
      (s) => s.index > focusEnd && s.index <= evaluationBarIndex
    );

  const presentationFocusWave =
    (bundle.presentation as { primary?: { wave?: WaveLabel } } | undefined)
      ?.primary?.wave ?? null;

  const canEstablishTransition =
    next.nextLegStartIndexAtOrBeforeBar || oppositeSwingAfterFocusEnd;
  const canEstablishProspectiveWave = false;
  notes.push(
    "Engine does not assign prospectiveWave without domain policy (no current+1)."
  );

  return {
    nextImpulseLegLabel: next.nextImpulseLegLabel,
    nextLegStartAtOrBeforeBar: next.nextLegStartIndexAtOrBeforeBar,
    nextLegEndConfirmedAtOrBeforeBar: next.nextLegEndConfirmedAtOrBeforeBar,
    oppositeSwingAfterFocusEnd,
    presentationFocusWave,
    canEstablishTransition,
    canEstablishProspectiveWave,
    temporalSafeAtBar: true,
    notes,
  };
}

export function prospectiveSetupSupportVerdict(): ProspectiveSetupSupportVerdict {
  return "NO_PROSPECTIVE_SETUP_SUPPORTED";
}

export function buildObjectivePhaseContext(
  setup: SetupCandidate,
  bundle: SymbolEvaluationBundle
): ObjectivePhaseContext {
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const focus = setup.scenarioRef.waveLabel;
  const { state: focusState } = focusWaveState(setup, bundle, evaluationBarIndex);
  const temporalClass = temporalClassFromFocusState(setup, focusState);
  const objectiveEligibility = resolveObjectiveEligibility(
    setup,
    bundle,
    focusState,
    temporalClass
  );
  const evidence: string[] = [
    "SETUP_CONFIRMED verifies catalog conditions at evaluation bar, not prospective trade opportunity.",
    `Target generation gate verdict (design): ${TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT}.`,
  ];
  if (setup.setupTypeId === "correction-end") {
    evidence.push(
      "Correction C leg endpoint confirmation is a completed corrective snapshot, not new impulse resumption."
    );
  }
  if (setup.setupTypeId === "impulse-continuation") {
    evidence.push(
      "Impulse continuation CONFIRMED requires leading focus leg CONFIRMED at bar (completed endpoint snapshot)."
    );
  }

  return {
    sourceSetupId: setup.id,
    sourceSetupType: setup.setupTypeId,
    temporalClass,
    completedStructuralWave:
      focusState === "ENDPOINT_CONFIRMED" ? focus : null,
    prospectiveWave: null,
    prospectiveWaveState: "UNRESOLVED",
    objectiveEligibility,
    evidence,
  };
}

export function resolveTradeSetupTemporalContext(
  setup: SetupCandidate,
  bundle: SymbolEvaluationBundle
): TradeSetupTemporalContext {
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const focus = setup.scenarioRef.waveLabel;
  const { state: focusState } = focusWaveState(setup, bundle, evaluationBarIndex);
  const temporalClass = temporalClassFromFocusState(setup, focusState);
  const objectiveEligibility = resolveObjectiveEligibility(
    setup,
    bundle,
    focusState,
    temporalClass
  );
  const transitionEvidence = buildTransitionEvidence(
    setup,
    bundle,
    evaluationBarIndex
  );
  const objectivePhase = buildObjectivePhaseContext(setup, bundle);

  let reason = `Focus wave ${focus} state ${focusState} at bar ${evaluationBarIndex}.`;
  if (objectiveEligibility === "OBJECTIVE_ALREADY_COMPLETED") {
    reason +=
      " Focus leg endpoint already confirmed — not a prospective objective phase for forward targets.";
  }
  if (objectiveEligibility === "NOT_PROSPECTIVE") {
    reason += " Setup is structural snapshot, not forward-looking objective context.";
  }

  return {
    setupId: setup.id,
    setupTypeId: setup.setupTypeId,
    lifecycleStatus: setup.status,
    semanticKind: semanticKindForSetupType(setup.setupTypeId),
    temporalClass,
    focusWave: focus,
    focusWaveState: focusState,
    evaluationBarIndex,
    objectiveEligibility,
    prospectiveWave: null,
    transitionEvidence,
    objectivePhase,
    reason,
    entryPlanEligibilityNote:
      "EntryPlan eligibility (CONFIRMED + evaluation bar) is independent of ObjectiveEligibility.",
  };
}
