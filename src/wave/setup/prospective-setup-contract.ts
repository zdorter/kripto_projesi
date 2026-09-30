import type { Candle } from "../types";
import type { WaveLabel } from "../types";
import { characterizeImpulseLegAtBar } from "./objective-wave-resolution";
import { compareOpenLegPaths } from "./open-structural-leg-comparison";
import { resolveOpenStructuralLeg } from "./open-structural-leg";
import type {
  OpenMovementVerdict,
  OpenStructuralLeg,
  StructuralTransitionVerdict,
} from "./open-structural-leg-types";
import type { SetupCandidate } from "./setup-types";
import { objectiveEligibilityFromProspectivePhase } from "./objective-target-eligibility-gate";
import type {
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
import { resolveProspectiveStructuralInvalidation } from "./prospective-structural-invalidation";
import {
  PRODUCTION_TRANSITION_RULE_ID,
  characterizeSwingTransitionRelation,
  resolveStructuralTransitionEvidenceLevel,
  subsequentConfirmedSwingAfterIndex,
} from "./structural-transition-semantics";

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

function scopedCandles(
  candles: Candle[] | undefined,
  evaluationBarIndex: number
): Candle[] {
  if (!candles?.length) {
    return [];
  }
  return candles.slice(0, evaluationBarIndex + 1);
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

function buildLegacyPotentialOpenLeg(
  bundle: SymbolEvaluationBundle,
  candidate: {
    label: WaveLabel;
    startIndex: number;
    endIndex: number;
    status: string;
  },
  evaluationBarIndex: number,
  candles: Candle[]
): OpenStructuralLeg | null {
  const effective = scopedCandles(candles, evaluationBarIndex);
  let startPrice = legStartPrice(
    bundle,
    candidate.label,
    candidate.startIndex
  );
  if (startPrice === null) {
    startPrice = effective[candidate.startIndex]?.close ?? null;
  }
  const evaluationPrice = effective[evaluationBarIndex]?.close;
  if (
    startPrice === null ||
    !Number.isFinite(evaluationPrice) ||
    !Number.isFinite(startPrice)
  ) {
    return null;
  }
  let high = -Infinity;
  let low = Infinity;
  for (let i = candidate.startIndex; i <= evaluationBarIndex; i++) {
    high = Math.max(high, effective[i].high);
    low = Math.min(low, effective[i].low);
  }
  const dir =
    evaluationPrice > startPrice
      ? "BULLISH"
      : evaluationPrice < startPrice
        ? "BEARISH"
        : "UNRESOLVED";
  return {
    anchorIndex: candidate.startIndex,
    anchorPrice: startPrice,
    anchorKind: "STRUCTURAL_ENDPOINT",
    selectedAnchorSources: [],
    observationEndIndex: evaluationBarIndex,
    evaluationBarIndex,
    evaluationPrice,
    observedHigh: high,
    observedLow: low,
    observedDirection: dir,
    state: "IN_PROGRESS",
    observationSpanBars: evaluationBarIndex - candidate.startIndex,
    futureSafe: candidate.endIndex <= evaluationBarIndex,
    evidence: [
      "LEGACY_POTENTIAL_OPEN_SPAN: WaveCandidate end beyond evaluation bar.",
    ],
    startIndex: candidate.startIndex,
    startPrice,
    direction: dir,
  };
}

function resolveLegacyPhase(
  completedAtIndex: number | null,
  candidate: ReturnType<typeof findInProgressImpulseLegAfter>,
  subsequent: { index: number; type: "HIGH" | "LOW" } | null,
  bundle: SymbolEvaluationBundle,
  focus: WaveLabel,
  evaluationBarIndex: number
): ProspectiveSetupContractResult["legacyPhaseStatus"] {
  if (completedAtIndex === null) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (candidate) {
    return "PHASE_IN_PROGRESS";
  }
  if (subsequent) {
    return "TRANSITION_OBSERVED";
  }
  const nextLabel = focus === "3" ? "4" : focus === "4" ? "5" : null;
  if (nextLabel) {
    const nw = flatWave(bundle, nextLabel);
    if (nw && nw.endIndex <= evaluationBarIndex && nw.status === "CONFIRMED") {
      return "PHASE_ALREADY_COMPLETED";
    }
  }
  return "NOT_ESTABLISHED";
}

function maxEvidenceIndex(
  transition: ProspectiveTransitionEvidence,
  anchorIndex: number | null
): number | null {
  const indices = [
    transition.completedAtIndex,
    transition.subsequentSwingIndex,
    transition.candidateLegStartIndex,
    transition.candidateLegEndIndex,
    anchorIndex,
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
  const objectiveEligibilityReasons: string[] = [];
  const temporal = resolveTradeSetupTemporalContext(historicalSetup, bundle);

  if (temporal.temporalClass !== "HISTORICAL_STRUCTURE") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Prospective contract requires completed historical structural snapshot (HISTORICAL_STRUCTURE).",
      `Source temporal class: ${temporal.temporalClass}.`,
    ]);
  }

  if (temporal.focusWaveState !== "ENDPOINT_CONFIRMED") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Prospective contract requires completed structural endpoint at evaluation bar.",
      `focusWaveState: ${temporal.focusWaveState}.`,
    ]);
  }

  const focus = historicalSetup.scenarioRef.waveLabel;
  const focusState = characterizeImpulseLegAtBar(
    bundle,
    focus,
    evaluationBarIndex
  );
  const completedAtIndex = focusState.endIndex;

  const subsequentDetailed =
    completedAtIndex !== null
      ? subsequentConfirmedSwingAfterIndex(
          bundle,
          completedAtIndex,
          evaluationBarIndex
        )
      : null;
  const subsequent = subsequentDetailed
    ? { index: subsequentDetailed.index, type: subsequentDetailed.type }
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
    swingConfirmationLagBars: subsequentDetailed?.swingConfirmationLagBars ?? null,
    transitionEvidenceLevel: "NO_TRANSITION",
    transitionRuleId: PRODUCTION_TRANSITION_RULE_ID,
    candidateLegLabel: candidate?.label ?? null,
    candidateLegStartIndex: candidate?.startIndex ?? null,
    candidateLegEndIndex: candidate?.endIndex ?? null,
    candidateLegState: candidate?.status ?? null,
    evaluationBarIndex,
    futureSafe: true,
    notes: [],
  };

  const legacyPhaseStatus = resolveLegacyPhase(
    completedAtIndex,
    candidate,
    subsequent,
    bundle,
    focus,
    evaluationBarIndex
  );
  if (candidate) {
    transition.notes.push(
      "LEGACY: Candidate impulse leg has end after bar (POTENTIAL open span)."
    );
  } else if (subsequent && completedAtIndex !== null) {
    const relation = characterizeSwingTransitionRelation({
      completedAtIndex,
      subsequentSwing: subsequent,
    });
    transition.notes.push(...relation.notes);
    transition.notes.push(
      "Subsequent confirmed swing after completed structure (index strictly greater than endpoint)."
    );
  }

  const effectiveCandles = scopedCandles(candles, evaluationBarIndex);
  const openLegResolution =
    effectiveCandles.length > 0
      ? resolveOpenStructuralLeg({
          bundle,
          candles: effectiveCandles,
          historicalSetup,
        })
      : null;

  const legacyPotentialOpenLeg =
    candidate && effectiveCandles.length > 0
      ? buildLegacyPotentialOpenLeg(
          bundle,
          candidate,
          evaluationBarIndex,
          effectiveCandles
        )
      : null;

  const openLegPathComparison = compareOpenLegPaths({
    legacyPotentialOpenLeg,
    openLegResolution,
  });

  const structuralTransitionVerdict: StructuralTransitionVerdict =
    subsequent !== null
      ? "STRUCTURAL_TRANSITION_OBSERVED"
      : "NO_STRUCTURAL_TRANSITION";

  const openMovementVerdict: OpenMovementVerdict =
    openLegResolution?.status === "AVAILABLE" &&
    openLegResolution.leg !== null &&
    openLegResolution.leg.anchorIndex === completedAtIndex
      ? "OPEN_MOVEMENT_OBSERVED"
      : openLegResolution?.status === "AVAILABLE"
        ? "OPEN_MOVEMENT_OBSERVED"
        : "NO_OPEN_MOVEMENT";

  transition.transitionEvidenceLevel = resolveStructuralTransitionEvidenceLevel(
    {
      subsequentSwingObserved: subsequent !== null,
      openMovementObserved:
        openMovementVerdict === "OPEN_MOVEMENT_OBSERVED",
      phaseInProgress: false,
    }
  );

  let phaseStatus: ProspectiveSetupContractResult["phaseStatus"] =
    "NOT_ESTABLISHED";
  if (completedAtIndex === null) {
    phaseStatus = "INSUFFICIENT_CONTEXT";
  } else if (
    structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED" &&
    openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" &&
    openLegResolution?.anchorSelection === "SELECTED" &&
    openLegResolution.leg?.anchorIndex === completedAtIndex
  ) {
    phaseStatus = "PHASE_IN_PROGRESS";
    transition.transitionEvidenceLevel = "STRUCTURAL_TRANSITION_CONFIRMED";
  } else if (openMovementVerdict === "OPEN_MOVEMENT_OBSERVED") {
    phaseStatus = "OPEN_MOVEMENT_OBSERVED";
    transition.transitionEvidenceLevel = "OPEN_MOVEMENT_ONLY";
    objectiveEligibilityReasons.push(
      "OPEN_LEG_AVAILABLE_BUT_TRANSITION_UNRESOLVED"
    );
  } else if (structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED") {
    phaseStatus = "TRANSITION_OBSERVED";
    transition.transitionEvidenceLevel = "SWING_TRANSITION_OBSERVED";
  } else {
    const nextLabel = focus === "3" ? "4" : focus === "4" ? "5" : null;
    if (nextLabel) {
      const nw = flatWave(bundle, nextLabel);
      if (nw && nw.endIndex <= evaluationBarIndex && nw.status === "CONFIRMED") {
        phaseStatus = "PHASE_ALREADY_COMPLETED";
      }
    }
  }

  const firstClassLeg =
    openLegResolution?.status === "AVAILABLE" ? openLegResolution.leg : null;

  const maxIdx = maxEvidenceIndex(
    transition,
    firstClassLeg?.anchorIndex ?? legacyPotentialOpenLeg?.anchorIndex ?? null
  );
  if (maxIdx !== null && maxIdx > evaluationBarIndex) {
    transition.futureSafe = false;
    reasons.push("POTENTIAL_LOOKAHEAD_RISK: evidence index exceeds evaluationBarIndex.");
  }
  if (openLegResolution && !openLegResolution.futureSafe) {
    transition.futureSafe = false;
  }

  const invalidationAvailable =
    resolveProspectiveStructuralInvalidation(historicalSetup).available;

  const objectiveEligibility = objectiveEligibilityFromProspectivePhase(
    phaseStatus,
    transition.futureSafe,
    invalidationAvailable
  );

  if (
    openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" &&
    phaseStatus !== "PHASE_IN_PROGRESS"
  ) {
    objectiveEligibilityReasons.push(
      "Open movement alone does not establish prospective objective phase."
    );
  }

  const prospectiveWaveLabel = null;

  let supportVerdict: ProspectiveSetupSupportVerdict =
    "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY";
  if (phaseStatus === "PHASE_IN_PROGRESS" && transition.futureSafe) {
    supportVerdict = "SUPPORTED_BY_CONTRACT";
  } else if (
    phaseStatus === "TRANSITION_OBSERVED" &&
    openLegResolution?.status !== "AVAILABLE"
  ) {
    supportVerdict = "ENGINE_CANNOT_REPRESENT_OPEN_OBJECTIVE_LEG";
    reasons.push(
      "Structural transition without first-class open leg at evaluation bar."
    );
  } else if (
    openLegResolution?.status === "AVAILABLE" &&
    phaseStatus === "OPEN_MOVEMENT_OBSERVED"
  ) {
    reasons.push(
      "First-class open leg observed; structural transition not fully established for phase."
    );
  }

  const productionSupportVerdicts: ProspectiveProductionSupportVerdict[] = [];
  if (openLegResolution?.status === "AVAILABLE") {
    productionSupportVerdicts.push("EXISTING_ENGINE_SUPPORTS_PROSPECTIVE_SETUP");
  } else {
    productionSupportVerdicts.push("NEEDS_OPEN_LEG_ABSTRACTION");
  }
  if (!transition.futureSafe) {
    productionSupportVerdicts.push("NEEDS_EVALUATION_SCOPED_ENGINE");
  }
  if (supportVerdict === "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY") {
    productionSupportVerdicts.push("NEEDS_NEW_WAVE_TRANSITION_POLICY");
  }

  reasons.push(
    "Prospective setup is structural phase context only — not prediction, signal, or recommendation."
  );
  reasons.push("prospectiveWaveLabel is not inferred from currentWave+1.");
  if (openLegPathComparison.verdict === "DIVERGENT") {
    reasons.push(
      `Open leg path divergence: ${openLegPathComparison.notes.join(" ")}`
    );
  }

  const labelFreeVerdict =
    firstClassLeg !== null && openLegResolution?.anchorSelection === "SELECTED"
      ? "SUPPORTED"
      : "UNRESOLVED";

  return {
    semanticCategory: PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
    familyId: PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    transitionEvidence: transition,
    openLeg: firstClassLeg,
    openLegResolution,
    legacyPotentialOpenLeg,
    openLegPathComparison,
    openMovementVerdict,
    structuralTransitionVerdict,
    legacyPhaseStatus,
    phaseStatus,
    prospectiveWaveLabel,
    objectiveEligibility,
    objectiveEligibilityReasons,
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
      swingConfirmationLagBars: null,
      transitionEvidenceLevel: "NO_TRANSITION",
      transitionRuleId: PRODUCTION_TRANSITION_RULE_ID,
      candidateLegLabel: null,
      candidateLegStartIndex: null,
      candidateLegEndIndex: null,
      candidateLegState: null,
      evaluationBarIndex,
      futureSafe: true,
      notes: [],
    },
    openLeg: null,
    openLegResolution: null,
    legacyPotentialOpenLeg: null,
    openLegPathComparison: null,
    openMovementVerdict: "NO_OPEN_MOVEMENT",
    structuralTransitionVerdict: "NO_STRUCTURAL_TRANSITION",
    legacyPhaseStatus: "INSUFFICIENT_CONTEXT",
    phaseStatus: "INSUFFICIENT_CONTEXT",
    prospectiveWaveLabel: null,
    objectiveEligibility: "INSUFFICIENT_CONTEXT",
    objectiveEligibilityReasons: [],
    invalidationAvailable: false,
    labelFreeVerdict: "UNRESOLVED",
    supportVerdict: "INSUFFICIENT_CONTEXT",
    productionSupportVerdicts: ["NEEDS_NEW_WAVE_TRANSITION_POLICY"],
    potentialLookaheadRisk: false,
    reasons,
  };
}
