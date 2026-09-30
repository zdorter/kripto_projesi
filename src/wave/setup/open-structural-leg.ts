import type { Candle } from "../types";
import { characterizeImpulseLegAtBar } from "./objective-wave-resolution";
import type { SetupCandidate } from "./setup-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import {
  mergeAnchorCandidatesByStructuralIdentity,
  structuralAnchorIdentityKey,
  structuralAnchorPricesEqual,
} from "./structural-anchor-identity";
import type {
  ObservedDirection,
  OpenStructuralLeg,
  OpenStructuralLegAnchorCandidate,
  OpenStructuralLegAnchorResolutionMode,
  OpenStructuralLegAnchorSelection,
  OpenStructuralLegAnchorSource,
  OpenStructuralLegResolution,
} from "./open-structural-leg-types";

function observedDirection(
  anchorPrice: number,
  evaluationPrice: number
): ObservedDirection {
  if (!Number.isFinite(anchorPrice) || !Number.isFinite(evaluationPrice)) {
    return "UNRESOLVED";
  }
  if (evaluationPrice > anchorPrice) {
    return "BULLISH";
  }
  if (evaluationPrice < anchorPrice) {
    return "BEARISH";
  }
  return "UNRESOLVED";
}

function pricePathRange(
  candles: Candle[],
  fromIndex: number,
  toIndex: number
): { high: number; low: number } | null {
  if (fromIndex > toIndex || fromIndex < 0 || toIndex >= candles.length) {
    return null;
  }
  let high = -Infinity;
  let low = Infinity;
  for (let i = fromIndex; i <= toIndex; i++) {
    high = Math.max(high, candles[i].high);
    low = Math.min(low, candles[i].low);
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }
  return { high, low };
}

function identityKey(c: OpenStructuralLegAnchorCandidate): string {
  return structuralAnchorIdentityKey(c.anchorIndex, c.anchorPrice);
}

function emptyResolution(
  partial: Partial<OpenStructuralLegResolution> & Pick<OpenStructuralLegResolution, "status">
): OpenStructuralLegResolution {
  return {
    status: partial.status,
    anchorSelection: partial.anchorSelection ?? "NO_SELECTION",
    anchorResolutionMode: partial.anchorResolutionMode ?? "GLOBAL",
    scopedCompletedEndpointIndex: partial.scopedCompletedEndpointIndex ?? null,
    anchorCandidates: partial.anchorCandidates ?? [],
    selectedAnchorSource: partial.selectedAnchorSource ?? null,
    leg: partial.leg ?? null,
    observationSpanBars: partial.observationSpanBars ?? 0,
    futureSafe: partial.futureSafe ?? false,
    reasons: partial.reasons ?? [],
  };
}

function buildLeg(
  anchor: OpenStructuralLegAnchorCandidate,
  evaluationBarIndex: number,
  evaluationPrice: number,
  range: { high: number; low: number }
): OpenStructuralLeg {
  const dir = observedDirection(anchor.anchorPrice, evaluationPrice);
  const span = evaluationBarIndex - anchor.anchorIndex;
  return {
    anchorIndex: anchor.anchorIndex,
    anchorPrice: anchor.anchorPrice,
    anchorKind: anchor.anchorKind,
    selectedAnchorSources: [...anchor.sources],
    observationEndIndex: evaluationBarIndex,
    evaluationBarIndex,
    evaluationPrice,
    observedHigh: range.high,
    observedLow: range.low,
    observedDirection: dir,
    state: "IN_PROGRESS",
    observationSpanBars: span,
    futureSafe: anchor.futureSafe,
    evidence: [
      "Open structural leg: confirmed anchor → closed evaluation bar observation.",
      "Observation end is not a pivot or wave endpoint.",
    ],
    startIndex: anchor.anchorIndex,
    startPrice: anchor.anchorPrice,
    direction: dir,
  };
}

function corroborationAtStructuralPoint(input: {
  bundle: SymbolEvaluationBundle;
  evaluationBarIndex: number;
  anchorIndex: number;
  anchorPrice: number;
  historicalSetup: SetupCandidate | null;
}): OpenStructuralLegAnchorCandidate[] {
  const { bundle, evaluationBarIndex, anchorIndex, anchorPrice, historicalSetup } =
    input;
  const raw: OpenStructuralLegAnchorCandidate[] = [];

  if (historicalSetup) {
    const endIndex = historicalSetup.sourceScenario.endIndex;
    const endPrice = historicalSetup.sourceScenario.endPrice;
    if (
      endIndex === anchorIndex &&
      structuralAnchorPricesEqual(endPrice, anchorPrice)
    ) {
      raw.push({
        anchorIndex,
        anchorPrice,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: anchorIndex <= evaluationBarIndex,
      });
    }
  }

  const primary = bundle.diagnostics.focus?.primary;
  if (
    primary &&
    primary.endIndex === anchorIndex &&
    structuralAnchorPricesEqual(primary.endPrice, anchorPrice) &&
    primary.endIndex <= evaluationBarIndex &&
    primary.status === "CONFIRMED"
  ) {
    raw.push({
      anchorIndex,
      anchorPrice,
      anchorKind: "STRUCTURAL_ENDPOINT",
      sources: ["SCENARIO_FOCUS_ENDPOINT"],
      futureSafe: primary.endIndex <= evaluationBarIndex,
    });
  }

  for (const swing of bundle.diagnostics.confirmedSwings ?? []) {
    if (
      swing.index === anchorIndex &&
      structuralAnchorPricesEqual(swing.price, anchorPrice) &&
      swing.index <= evaluationBarIndex
    ) {
      raw.push({
        anchorIndex,
        anchorPrice,
        anchorKind: swing.type,
        sources: ["CONFIRMED_SWING"],
        futureSafe: swing.index <= evaluationBarIndex,
      });
    }
  }

  return mergeAnchorCandidatesByStructuralIdentity(raw);
}

function resolveCandidateScopedOpenLeg(input: {
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
  historicalSetup: SetupCandidate;
  evaluationBarIndex: number;
  evaluationPrice: number;
  effectiveCandles: Candle[];
}): OpenStructuralLegResolution {
  const { bundle, historicalSetup, evaluationBarIndex, evaluationPrice, effectiveCandles } =
    input;
  const reasons: string[] = [
    "Candidate-scoped anchor: completed source endpoint only (no global best-anchor race).",
  ];

  const endIndex = historicalSetup.sourceScenario.endIndex;
  const endPrice = historicalSetup.sourceScenario.endPrice;
  const focus = historicalSetup.scenarioRef.waveLabel;
  const focusState = characterizeImpulseLegAtBar(
    bundle,
    focus,
    evaluationBarIndex
  );

  const endpointConfirmed =
    focusState.state === "ENDPOINT_CONFIRMED" &&
    focusState.endIndex === endIndex &&
    endIndex <= evaluationBarIndex &&
    Number.isFinite(endPrice);

  if (!endpointConfirmed) {
    return emptyResolution({
      status: "ANCHOR_CONFLICT",
      anchorSelection: "CONFLICT",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      futureSafe: true,
      reasons: [
        ...reasons,
        "Source completed endpoint not confirmed by engine at evaluation bar.",
      ],
    });
  }

  const anchorCandidates = corroborationAtStructuralPoint({
    bundle,
    evaluationBarIndex,
    anchorIndex: endIndex,
    anchorPrice: endPrice,
    historicalSetup,
  });

  if (anchorCandidates.length !== 1) {
    return emptyResolution({
      status: "ANCHOR_CONFLICT",
      anchorSelection: "CONFLICT",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      futureSafe: true,
      reasons: [
        ...reasons,
        "Engine could not corroborate source completed endpoint identity.",
      ],
    });
  }

  const selected = anchorCandidates[0]!;

  if (selected.anchorIndex >= evaluationBarIndex) {
    return emptyResolution({
      status: "NO_OBSERVED_SPAN",
      anchorSelection: "SELECTED",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: selected.futureSafe,
      reasons: [...reasons, "anchorIndex equals evaluationBarIndex; no observed span."],
    });
  }

  const range = pricePathRange(
    effectiveCandles,
    selected.anchorIndex,
    evaluationBarIndex
  );
  if (!range) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection: "SELECTED",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: false,
      reasons: [...reasons, "Could not compute observed price path range."],
    });
  }

  const leg = buildLeg(selected, evaluationBarIndex, evaluationPrice, range);
  const futureSafe =
    leg.futureSafe &&
    leg.anchorIndex <= evaluationBarIndex &&
    leg.observationEndIndex <= evaluationBarIndex;

  return emptyResolution({
    status: "AVAILABLE",
    anchorSelection: "SELECTED",
    anchorResolutionMode: "CANDIDATE_SCOPED",
    scopedCompletedEndpointIndex: endIndex,
    anchorCandidates,
    selectedAnchorSource:
      selected.sources.length === 1 ? selected.sources[0]! : null,
    leg: { ...leg, futureSafe },
    observationSpanBars: leg.observationSpanBars,
    futureSafe,
    reasons: [
      ...reasons,
      "Open leg spans source completed endpoint through closed evaluation bar only.",
    ],
  });
}

function resolveGlobalOpenLeg(input: {
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
  historicalSetup: SetupCandidate | null;
  evaluationBarIndex: number;
  evaluationPrice: number;
  effectiveCandles: Candle[];
}): OpenStructuralLegResolution {
  const { bundle, historicalSetup, evaluationBarIndex, evaluationPrice, effectiveCandles } =
    input;
  const reasons: string[] = [];
  const rawCandidates: OpenStructuralLegAnchorCandidate[] = [];

  if (historicalSetup) {
    const endIndex = historicalSetup.sourceScenario.endIndex;
    const endPrice = historicalSetup.sourceScenario.endPrice;
    const focus = historicalSetup.scenarioRef.waveLabel;
    const focusState = characterizeImpulseLegAtBar(
      bundle,
      focus,
      evaluationBarIndex
    );
    const endpointConfirmed =
      focusState.state === "ENDPOINT_CONFIRMED" &&
      focusState.endIndex === endIndex;
    if (
      endpointConfirmed &&
      endIndex <= evaluationBarIndex &&
      Number.isFinite(endPrice)
    ) {
      rawCandidates.push({
        anchorIndex: endIndex,
        anchorPrice: endPrice,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: endIndex <= evaluationBarIndex,
      });
    }
  }

  const primary = bundle.diagnostics.focus?.primary;
  if (
    primary &&
    primary.endIndex <= evaluationBarIndex &&
    primary.status === "CONFIRMED"
  ) {
    rawCandidates.push({
      anchorIndex: primary.endIndex,
      anchorPrice: primary.endPrice,
      anchorKind: "STRUCTURAL_ENDPOINT",
      sources: ["SCENARIO_FOCUS_ENDPOINT"],
      futureSafe: primary.endIndex <= evaluationBarIndex,
    });
  }

  const swings = (bundle.diagnostics.confirmedSwings ?? []).filter(
    (s) => s.index <= evaluationBarIndex
  );
  if (swings.length > 0) {
    const last = swings[swings.length - 1];
    rawCandidates.push({
      anchorIndex: last.index,
      anchorPrice: last.price,
      anchorKind: last.type,
      sources: ["CONFIRMED_SWING"],
      futureSafe: last.index <= evaluationBarIndex,
    });
  }

  const anchorCandidates = mergeAnchorCandidatesByStructuralIdentity(rawCandidates);

  if (anchorCandidates.length === 0) {
    return emptyResolution({
      status: "NO_ANCHOR",
      anchorResolutionMode: "GLOBAL",
      futureSafe: true,
      reasons: ["No anchor candidates within evaluation scope."],
    });
  }

  let anchorSelection: OpenStructuralLegAnchorSelection = "NO_SELECTION";
  let selected: OpenStructuralLegAnchorCandidate | null = null;
  if (anchorCandidates.length === 1) {
    anchorSelection = "SELECTED";
    selected = anchorCandidates[0]!;
  } else {
    anchorSelection = "AMBIGUOUS";
    reasons.push(
      `Multiple distinct structural anchor identities: ${anchorCandidates.map(identityKey).join(", ")}.`
    );
  }

  if (!selected) {
    return emptyResolution({
      status: "AMBIGUOUS_ANCHOR",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      futureSafe: anchorCandidates.every((c) => c.futureSafe),
      reasons,
    });
  }

  if (selected.anchorIndex >= evaluationBarIndex) {
    return emptyResolution({
      status: "NO_OBSERVED_SPAN",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: selected.futureSafe,
      reasons: [...reasons, "anchorIndex equals evaluationBarIndex; no observed span."],
    });
  }

  const range = pricePathRange(
    effectiveCandles,
    selected.anchorIndex,
    evaluationBarIndex
  );
  if (!range) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: false,
      reasons: [...reasons, "Could not compute observed price path range."],
    });
  }

  const leg = buildLeg(selected, evaluationBarIndex, evaluationPrice, range);
  const futureSafe =
    leg.futureSafe &&
    leg.anchorIndex <= evaluationBarIndex &&
    leg.observationEndIndex <= evaluationBarIndex;

  return emptyResolution({
    status: "AVAILABLE",
    anchorSelection,
    anchorResolutionMode: "GLOBAL",
    anchorCandidates,
    selectedAnchorSource:
      selected.sources.length === 1 ? selected.sources[0]! : null,
    leg: { ...leg, futureSafe },
    observationSpanBars: leg.observationSpanBars,
    futureSafe,
    reasons: [
      ...reasons,
      "Open leg spans confirmed anchor through closed evaluation bar only.",
    ],
  });
}

export function resolveOpenStructuralLeg(input: {
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
  historicalSetup?: SetupCandidate | null;
  anchorResolutionMode?: OpenStructuralLegAnchorResolutionMode;
}): OpenStructuralLegResolution {
  const { bundle, candles, historicalSetup } = input;
  const mode =
    input.anchorResolutionMode ??
    (historicalSetup ? "CANDIDATE_SCOPED" : "GLOBAL");
  const evaluationBarIndex = bundle.evaluationBarIndex;

  if (
    !bundle.evaluationBarBoundaryEstablished ||
    evaluationBarIndex < 0 ||
    candles.length === 0
  ) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["Evaluation bar boundary not established or empty candles."],
    });
  }

  if (evaluationBarIndex >= candles.length) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["evaluationBarIndex beyond scoped candle array."],
    });
  }

  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1);
  const evaluationPrice = effectiveCandles[evaluationBarIndex]?.close;
  if (!Number.isFinite(evaluationPrice)) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["Evaluation candle close unavailable."],
    });
  }

  if (mode === "CANDIDATE_SCOPED" && historicalSetup) {
    return resolveCandidateScopedOpenLeg({
      bundle,
      candles,
      historicalSetup,
      evaluationBarIndex,
      evaluationPrice: evaluationPrice as number,
      effectiveCandles,
    });
  }

  return resolveGlobalOpenLeg({
    bundle,
    candles,
    historicalSetup: historicalSetup ?? null,
    evaluationBarIndex,
    evaluationPrice: evaluationPrice as number,
    effectiveCandles,
  });
}
