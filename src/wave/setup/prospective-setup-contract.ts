import type { Candle } from "../types";
import type { WaveLabel } from "../types";
import { characterizeImpulseLegAtBar } from "./objective-wave-resolution";
import type { SetupCandidate } from "./setup-types";
import { objectiveEligibilityFromProspectivePhase } from "./objective-target-eligibility-gate";
import type {
  OpenStructuralLeg,
  ProspectiveProductionSupportVerdict,
  ProspectiveSetupContractResult,
  ProspectiveSetupSupportVerdict,
  ProspectiveTransitionEvidence,
} from "./prospective-setup-contract-types";
import {
  PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
  PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
} from "./prospective-setup-contract-types";
import { resolveTradeSetupTemporalContext } from "./trade-setup-temporal-semantics";
import type { SymbolEvaluationBundle } from "./trade-setup-types";

function flatWave(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel
) {
  return bundle.presentation?.engine?.flatWaves?.find((w) => w.label === label);
}

function findInProgressImpulseLegAfter(
  bundle: SymbolEvaluationBundle,
  afterEndIndex: number,
  evaluationBarIndex: number
): {
  label: WaveLabel;
  startIndex: number;
  endIndex: number;
  status: string;
} | null {
  const waves = bundle.presentation?.engine?.flatWaves ?? [];
  for (const w of waves) {
    if (!["1", "2", "3", "4", "5"].includes(w.label)) {
      continue;
    }
    if (w.startIndex <= afterEndIndex) {
      continue;
    }
    if (w.startIndex > evaluationBarIndex) {
      continue;
    }
    if (w.endIndex > evaluationBarIndex) {
      return {
        label: w.label as WaveLabel,
        startIndex: w.startIndex,
        endIndex: w.endIndex,
        status: w.status,
      };
    }
  }
  return null;
}

function subsequentSwingAfter(
  bundle: SymbolEvaluationBundle,
  afterIndex: number,
  evaluationBarIndex: number
): { index: number; type: "HIGH" | "LOW" } | null {
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const next = swings
    .filter((s) => s.index > afterIndex && s.index <= evaluationBarIndex)
    .sort((a, b) => a.index - b.index)[0];
  return next ? { index: next.index, type: next.type } : null;
}

function evaluationBarClose(
  candles: Candle[] | undefined,
  evaluationBarIndex: number
): number | null {
  const c = candles?.[evaluationBarIndex];
  return c && Number.isFinite(c.close) ? c.close : null;
}

function legStartPrice(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel,
  startIndex: number
): number | null {
  const leg = bundle.diagnostics.waveLegs.find(
    (l) => l.structure === "IMPULSE" && l.label === label
  );
  if (leg && leg.startIndex === startIndex) {
    return leg.startPrice;
  }
  const swing = bundle.diagnostics.confirmedSwings.find(
    (s) => s.index === startIndex
  );
  return swing?.price ?? null;
}

function openLegDirection(
  bundle: SymbolEvaluationBundle,
  startPrice: number | null,
  evaluationPrice: number | null
): OpenStructuralLeg["direction"] {
  if (
    startPrice === null ||
    evaluationPrice === null ||
    !Number.isFinite(startPrice) ||
    !Number.isFinite(evaluationPrice)
  ) {
    return "UNRESOLVED";
  }
  if (evaluationPrice > startPrice) {
    return "BULLISH";
  }
  if (evaluationPrice < startPrice) {
    return "BEARISH";
  }
  return "UNRESOLVED";
}

function maxEvidenceIndex(
  transition: ProspectiveTransitionEvidence,
  openLeg: OpenStructuralLeg | null
): number | null {
  const indices = [
    transition.completedAtIndex,
    transition.subsequentSwingIndex,
    transition.candidateLegStartIndex,
    transition.candidateLegEndIndex,
    openLeg?.startIndex ?? null,
  ].filter((x): x is number => x !== null && Number.isFinite(x));
  if (indices.length === 0) {
    return null;
  }
  return Math.max(...indices);
}

export function resolveProspectiveSetupContract(input: {
  historicalSetup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
  candles?: Candle[];
}): ProspectiveSetupContractResult {
  const { historicalSetup, bundle, candles } = input;
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const reasons: string[] = [];
  const temporal = resolveTradeSetupTemporalContext(historicalSetup, bundle);

  if (temporal.temporalClass !== "HISTORICAL_STRUCTURE") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Prospective contract requires completed historical structural snapshot (HISTORICAL_STRUCTURE).",
      `Source temporal class: ${temporal.temporalClass}.`,
    ]);
  }

  if (historicalSetup.status !== "CONFIRMED") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Source setup must be CONFIRMED historical snapshot.",
    ]);
  }

  const focus = historicalSetup.scenarioRef.waveLabel;
  const focusState = characterizeImpulseLegAtBar(
    bundle,
    focus,
    evaluationBarIndex
  );
  const completedAtIndex = focusState.endIndex;

  const subsequent = completedAtIndex !== null
    ? subsequentSwingAfter(bundle, completedAtIndex, evaluationBarIndex)
    : null;

  const candidate =
    completedAtIndex !== null
      ? findInProgressImpulseLegAfter(
          bundle,
          completedAtIndex,
          evaluationBarIndex
        )
      : null;

  const transition: ProspectiveTransitionEvidence = {
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    completedStructure: focusState.state === "ENDPOINT_CONFIRMED" ? focus : null,
    completedAtIndex,
    subsequentSwingIndex: subsequent?.index ?? null,
    subsequentSwingDirection: subsequent?.type ?? null,
    candidateLegLabel: candidate?.label ?? null,
    candidateLegStartIndex: candidate?.startIndex ?? null,
    candidateLegEndIndex: candidate?.endIndex ?? null,
    candidateLegState: candidate?.status ?? null,
    evaluationBarIndex,
    futureSafe: true,
    notes: [],
  };

  let phase: ProspectiveSetupContractResult["phaseStatus"] = "NOT_ESTABLISHED";
  if (completedAtIndex === null) {
    phase = "INSUFFICIENT_CONTEXT";
  } else if (candidate) {
    phase = "PHASE_IN_PROGRESS";
    transition.notes.push(
      "Candidate impulse leg has start at/before bar and end after bar (open segment in WaveCandidate pivot model)."
    );
  } else if (subsequent) {
    phase = "TRANSITION_OBSERVED";
    transition.notes.push(
      "Subsequent confirmed swing after completed structure; no open WaveCandidate leg at bar."
    );
  } else {
    const nextLabel =
      focus === "3" ? "4" : focus === "4" ? "5" : null;
    if (nextLabel) {
      const nw = flatWave(bundle, nextLabel);
      if (nw && nw.endIndex <= evaluationBarIndex && nw.status === "CONFIRMED") {
        phase = "PHASE_ALREADY_COMPLETED";
      }
    }
  }

  const evalPrice = evaluationBarClose(candles, evaluationBarIndex);
  let openLeg: OpenStructuralLeg | null = null;
  if (candidate) {
    const startPrice = legStartPrice(
      bundle,
      candidate.label,
      candidate.startIndex
    );
    openLeg = {
      startIndex: candidate.startIndex,
      startPrice,
      evaluationBarIndex,
      evaluationPrice: evalPrice,
      direction: openLegDirection(bundle, startPrice, evalPrice),
      state: "IN_PROGRESS",
      evidence: [
        "Open leg derived from WaveCandidate with end pivot beyond evaluation bar.",
        "POTENTIAL/CONFIRMED status does not alone identify objective wave label.",
      ],
    };
  }

  const maxIdx = maxEvidenceIndex(transition, openLeg);
  if (maxIdx !== null && maxIdx > evaluationBarIndex) {
    transition.futureSafe = false;
    reasons.push("POTENTIAL_LOOKAHEAD_RISK: evidence index exceeds evaluationBarIndex.");
  }

  const invalidationAvailable =
    historicalSetup.invalidation.usesScenarioInvalidation &&
    historicalSetup.invalidation.conditions.some((c) => c.outcome === "MET");

  const objectiveEligibility = objectiveEligibilityFromProspectivePhase(
    phase,
    transition.futureSafe,
    invalidationAvailable
  );

  const prospectiveWaveLabel = null;

  let supportVerdict: ProspectiveSetupSupportVerdict =
    "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY";
  if (phase === "PHASE_IN_PROGRESS" && transition.futureSafe) {
    supportVerdict = "SUPPORTED_BY_CONTRACT";
  } else if (phase === "TRANSITION_OBSERVED" && !candidate) {
    supportVerdict = "ENGINE_CANNOT_REPRESENT_OPEN_OBJECTIVE_LEG";
    reasons.push(
      "Transition swing observed but engine lacks open objective leg representation at evaluation bar."
    );
  }

  const productionSupportVerdicts: ProspectiveProductionSupportVerdict[] = [
    "NEEDS_EVALUATION_SCOPED_ENGINE",
  ];
  if (!candidate && phase === "TRANSITION_OBSERVED") {
    productionSupportVerdicts.push("NEEDS_OPEN_LEG_ABSTRACTION");
  }
  if (supportVerdict === "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY") {
    productionSupportVerdicts.push("NEEDS_NEW_WAVE_TRANSITION_POLICY");
  }

  reasons.push(
    "Prospective setup is structural phase context only — not prediction, signal, or recommendation."
  );
  reasons.push("prospectiveWaveLabel is not inferred from currentWave+1.");

  const labelFreeVerdict =
    phase === "PHASE_IN_PROGRESS" && openLeg !== null
      ? "SUPPORTED"
      : "UNRESOLVED";

  return {
    semanticCategory: PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
    familyId: PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    transitionEvidence: transition,
    openLeg,
    phaseStatus: phase,
    prospectiveWaveLabel,
    objectiveEligibility,
    invalidationAvailable,
    labelFreeVerdict,
    supportVerdict,
    productionSupportVerdicts,
    potentialLookaheadRisk: !transition.futureSafe,
    reasons,
  };
}

function unsupportedResult(
  historicalSetup: SetupCandidate,
  evaluationBarIndex: number,
  reasons: string[]
): ProspectiveSetupContractResult {
  return {
    semanticCategory: PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
    familyId: PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    transitionEvidence: {
      sourceSetupId: historicalSetup.id,
      sourceSetupType: historicalSetup.setupTypeId,
      completedStructure: null,
      completedAtIndex: null,
      subsequentSwingIndex: null,
      subsequentSwingDirection: null,
      candidateLegLabel: null,
      candidateLegStartIndex: null,
      candidateLegEndIndex: null,
      candidateLegState: null,
      evaluationBarIndex,
      futureSafe: true,
      notes: [],
    },
    openLeg: null,
    phaseStatus: "INSUFFICIENT_CONTEXT",
    prospectiveWaveLabel: null,
    objectiveEligibility: "INSUFFICIENT_CONTEXT",
    invalidationAvailable: false,
    labelFreeVerdict: "UNRESOLVED",
    supportVerdict: "INSUFFICIENT_CONTEXT",
    productionSupportVerdicts: ["NEEDS_NEW_WAVE_TRANSITION_POLICY"],
    potentialLookaheadRisk: false,
    reasons,
  };
}
