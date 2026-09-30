import type { WaveLabel } from "../types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type {
  CurrentWaveLabel,
  ImpulseLegTemporalState,
  NextStructuralEvidence,
  ObjectiveWaveResolutionContext,
  ObjectiveWaveResolutionStatus,
  ObjectiveWaveTemporalCompatibility,
  RelationshipTemplateKeyingVerdict,
} from "./objective-wave-resolution-types";

const IMPULSE_CONTINUATION_PHASE: readonly WaveLabel[] = ["3", "4", "5"];

function flatWave(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel
): {
  startIndex: number;
  endIndex: number;
  status: string;
} | null {
  const w = bundle.presentation?.engine?.flatWaves?.find((x) => x.label === label);
  if (!w) {
    return null;
  }
  return w;
}

export function characterizeImpulseLegAtBar(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel,
  evaluationBarIndex: number
): { state: ImpulseLegTemporalState; endIndex: number | null } {
  const w = flatWave(bundle, label);
  if (!w) {
    return { state: "NOT_PRESENT", endIndex: null };
  }
  if (w.status === "INVALIDATED") {
    return { state: "INVALIDATED", endIndex: w.endIndex };
  }
  if (w.startIndex > evaluationBarIndex) {
    return { state: "NOT_STARTED", endIndex: w.endIndex };
  }
  if (w.endIndex > evaluationBarIndex) {
    return { state: "IN_PROGRESS", endIndex: w.endIndex };
  }
  if (w.status === "CONFIRMED") {
    return { state: "ENDPOINT_CONFIRMED", endIndex: w.endIndex };
  }
  return { state: "IN_PROGRESS", endIndex: w.endIndex };
}

/** Structural next leg in impulse count — not objective wave resolution. */
function lookupNextImpulseLegLabel(current: CurrentWaveLabel): WaveLabel | null {
  if (current === "3") {
    return "4";
  }
  if (current === "4") {
    return "5";
  }
  return null;
}

export function buildNextStructuralEvidence(
  bundle: SymbolEvaluationBundle,
  currentWaveLabel: CurrentWaveLabel,
  evaluationBarIndex: number
): NextStructuralEvidence {
  const nextImpulseLegLabel = lookupNextImpulseLegLabel(currentWaveLabel);
  if (!nextImpulseLegLabel) {
    return {
      nextImpulseLegLabel: null,
      nextLegStartIndexAtOrBeforeBar: false,
      nextLegEndConfirmedAtOrBeforeBar: false,
      nextLegStartIndex: null,
      nextLegEndIndex: null,
    };
  }
  const w = flatWave(bundle, nextImpulseLegLabel);
  if (!w) {
    return {
      nextImpulseLegLabel,
      nextLegStartIndexAtOrBeforeBar: false,
      nextLegEndConfirmedAtOrBeforeBar: false,
      nextLegStartIndex: null,
      nextLegEndIndex: null,
    };
  }
  const nextState = characterizeImpulseLegAtBar(
    bundle,
    nextImpulseLegLabel,
    evaluationBarIndex
  );
  return {
    nextImpulseLegLabel,
    nextLegStartIndexAtOrBeforeBar:
      nextState.state !== "NOT_PRESENT" && nextState.state !== "NOT_STARTED",
    nextLegEndConfirmedAtOrBeforeBar: nextState.state === "ENDPOINT_CONFIRMED",
    nextLegStartIndex: w.startIndex,
    nextLegEndIndex: w.endIndex,
  };
}

function temporalCompatibilityFor(
  currentWaveLabel: CurrentWaveLabel,
  currentWaveState: ImpulseLegTemporalState
): ObjectiveWaveTemporalCompatibility {
  if (!IMPULSE_CONTINUATION_PHASE.includes(currentWaveLabel)) {
    return "NOT_APPLICABLE";
  }
  if (currentWaveState === "IN_PROGRESS") {
    return "CURRENT_LEG_IN_PROGRESS";
  }
  if (currentWaveState === "ENDPOINT_CONFIRMED") {
    if (currentWaveLabel === "3") {
      return "TEMPORALLY_LATE_FOR_OBJECTIVE_W3";
    }
    if (currentWaveLabel === "5") {
      return "TEMPORALLY_LATE_FOR_OBJECTIVE_W5";
    }
    return "COMPATIBLE_WITH_FORWARD_OBJECTIVE";
  }
  return "NOT_APPLICABLE";
}

function relationshipTemplateKeyingVerdict(): RelationshipTemplateKeyingVerdict {
  return "OBJECTIVE_WAVE_KEYED_REQUIRED";
}

/**
 * Resolves objective-wave context from existing setup/engine semantics only.
 * Does not apply currentWave+1, ratio policy, or target prices.
 */
export function resolveObjectiveWaveContext(
  plan: EntryPlanCandidate,
  bundle: SymbolEvaluationBundle
): ObjectiveWaveResolutionContext {
  const evaluationBarIndex = plan.evaluationBar.evaluationBarIndex;
  const currentWaveLabel = plan.scenarioRef.waveLabel as CurrentWaveLabel;
  const evidence: string[] = [];
  const setupConfirmed = plan.setupRef.sourceSetupStatus === "CONFIRMED";

  if (plan.setupTypeId !== "impulse-continuation") {
    return {
      setupId: plan.setupRef.setupId,
      setupTypeId: plan.setupTypeId,
      setupConfirmed,
      currentWaveLabel,
      currentWaveState: "INSUFFICIENT_CONTEXT",
      currentWaveEndIndex: null,
      evaluationBarIndex,
      objectiveWaveLabel: null,
      objectiveWaveState: "INSUFFICIENT_CONTEXT",
      status: "NOT_APPLICABLE",
      nextStructuralEvidence: buildNextStructuralEvidence(
        bundle,
        currentWaveLabel,
        evaluationBarIndex
      ),
      temporalCompatibility: "NOT_APPLICABLE",
      relationshipTemplateKeyingVerdict: "UNKNOWN",
      setupNameSemanticMismatch: false,
      evidence: ["Not impulse-continuation setup type."],
    };
  }

  if (!IMPULSE_CONTINUATION_PHASE.includes(currentWaveLabel)) {
    return {
      setupId: plan.setupRef.setupId,
      setupTypeId: plan.setupTypeId,
      setupConfirmed,
      currentWaveLabel,
      currentWaveState: "INSUFFICIENT_CONTEXT",
      currentWaveEndIndex: null,
      evaluationBarIndex,
      objectiveWaveLabel: null,
      objectiveWaveState: "NOT_PRESENT",
      status: "INSUFFICIENT_CONTEXT",
      nextStructuralEvidence: buildNextStructuralEvidence(
        bundle,
        currentWaveLabel,
        evaluationBarIndex
      ),
      temporalCompatibility: "NOT_APPLICABLE",
      relationshipTemplateKeyingVerdict: "UNKNOWN",
      setupNameSemanticMismatch: false,
      evidence: ["Scenario wave is not impulse continuation phase label 3/4/5."],
    };
  }

  const current = characterizeImpulseLegAtBar(
    bundle,
    currentWaveLabel,
    evaluationBarIndex
  );
  const nextStructuralEvidence = buildNextStructuralEvidence(
    bundle,
    currentWaveLabel,
    evaluationBarIndex
  );

  evidence.push(
    "scenarioRef.waveLabel is the scanner scenario focus leg (trade-setup-rules: impulse-leading-leg-confirmed-at-bar, impulse-continuation-phase-active)."
  );
  evidence.push(
    setupConfirmed
      ? "SETUP_CONFIRMED means catalog prerequisites, trigger, and tradeConfirmation conditions are MET at evaluation bar — not objective wave resolution."
      : "Setup is not CONFIRMED; objective resolution still characterized for diagnostics."
  );

  if (setupConfirmed) {
    evidence.push(
      `impulse-leading-leg-confirmed-at-bar requires wave ${currentWaveLabel} CONFIRMED with endIndex <= evaluationBarIndex (${evaluationBarIndex}).`
    );
  }

  let status: ObjectiveWaveResolutionStatus = "OBJECTIVE_WAVE_UNRESOLVED";
  const objectiveWaveLabel = null;
  const objectiveWaveState: ImpulseLegTemporalState = "NOT_PRESENT";

  evidence.push(
    "Engine contract does not define objectiveWaveLabel; no currentWave+1 resolution rule applied."
  );

  if (current.state === "ENDPOINT_CONFIRMED") {
    if (currentWaveLabel === "4") {
      if (!nextStructuralEvidence.nextLegStartIndexAtOrBeforeBar) {
        status = "NEXT_WAVE_NOT_ESTABLISHED";
        evidence.push(
          "W4 endpoint confirmed at bar; wave 5 start not established at or before evaluation bar — W5 not inferred."
        );
      } else {
        status = "OBJECTIVE_WAVE_UNRESOLVED";
        evidence.push(
          "W5 leg has start evidence at bar but objective wave label is not assigned without domain policy."
        );
      }
    } else if (currentWaveLabel === "3" || currentWaveLabel === "5") {
      status = "CURRENT_WAVE_ALREADY_COMPLETED";
      evidence.push(
        `Current leg ${currentWaveLabel} endpoint is CONFIRMED at evaluation bar; continuation target on same leg may be temporally late.`
      );
    }
  }

  const setupNameSemanticMismatch =
    setupConfirmed && plan.setupTypeId === "impulse-continuation";

  if (setupNameSemanticMismatch) {
    evidence.push(
      "SETUP_NAME_SEMANTIC_MISMATCH: impulse-continuation CONFIRMED characterizes the leading impulse leg at the evaluation bar, not a forward objective wave label in engine contract."
    );
  }

  const temporalCompatibility = temporalCompatibilityFor(
    currentWaveLabel,
    current.state
  );

  return {
    setupId: plan.setupRef.setupId,
    setupTypeId: plan.setupTypeId,
    setupConfirmed,
    currentWaveLabel,
    currentWaveState: current.state,
    currentWaveEndIndex: current.endIndex,
    evaluationBarIndex,
    objectiveWaveLabel,
    objectiveWaveState,
    status,
    nextStructuralEvidence,
    temporalCompatibility,
    relationshipTemplateKeyingVerdict: relationshipTemplateKeyingVerdict(),
    setupNameSemanticMismatch,
    evidence,
  };
}
