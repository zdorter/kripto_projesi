import type { Candle } from "../types";
import { characterizeImpulseLegAtBar } from "./objective-wave-resolution";
import type { SetupCandidate } from "./setup-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type {
  ObservedDirection,
  OpenStructuralLeg,
  OpenStructuralLegAnchorCandidate,
  OpenStructuralLegAnchorKind,
  OpenStructuralLegAnchorSelection,
  OpenStructuralLegAnchorSource,
  OpenStructuralLegResolution,
  OpenStructuralLegStatus,
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

function candidateKey(c: OpenStructuralLegAnchorCandidate): string {
  return `${c.anchorIndex}:${c.anchorPrice.toFixed(8)}:${c.anchorKind}`;
}

function mergeCandidates(
  raw: OpenStructuralLegAnchorCandidate[]
): OpenStructuralLegAnchorCandidate[] {
  const byKey = new Map<string, OpenStructuralLegAnchorCandidate>();
  for (const c of raw) {
    const key = candidateKey(c);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...c,
        sources: [...c.sources],
      });
      continue;
    }
    const sources = new Set([
      ...existing.sources,
      ...c.sources,
    ]) as Set<OpenStructuralLegAnchorSource>;
    existing.sources = [...sources];
    existing.futureSafe = existing.futureSafe && c.futureSafe;
  }
  return [...byKey.values()].sort((a, b) => a.anchorIndex - b.anchorIndex);
}

function buildLeg(
  anchor: OpenStructuralLegAnchorCandidate,
  evaluationBarIndex: number,
  evaluationPrice: number,
  range: { high: number; low: number }
): OpenStructuralLeg {
  const dir = observedDirection(anchor.anchorPrice, evaluationPrice);
  const span = evaluationBarIndex - anchor.anchorIndex;
  const leg: OpenStructuralLeg = {
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
  return leg;
}

export function resolveOpenStructuralLeg(input: {
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
  historicalSetup?: SetupCandidate | null;
}): OpenStructuralLegResolution {
  const { bundle, candles, historicalSetup } = input;
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const reasons: string[] = [];

  if (
    !bundle.evaluationBarBoundaryEstablished ||
    evaluationBarIndex < 0 ||
    candles.length === 0
  ) {
    return {
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection: "NO_SELECTION",
      anchorCandidates: [],
      selectedAnchorSource: null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: false,
      reasons: ["Evaluation bar boundary not established or empty candles."],
    };
  }

  if (evaluationBarIndex >= candles.length) {
    return {
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection: "NO_SELECTION",
      anchorCandidates: [],
      selectedAnchorSource: null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: false,
      reasons: ["evaluationBarIndex beyond scoped candle array."],
    };
  }

  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1);
  const evaluationPrice = effectiveCandles[evaluationBarIndex]?.close;
  if (!Number.isFinite(evaluationPrice)) {
    return {
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection: "NO_SELECTION",
      anchorCandidates: [],
      selectedAnchorSource: null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: false,
      reasons: ["Evaluation candle close unavailable."],
    };
  }

  const rawCandidates: OpenStructuralLegAnchorCandidate[] = [];

  if (historicalSetup?.status === "CONFIRMED") {
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

  const primary = bundle.diagnostics.focus.primary;
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

  const swings = bundle.diagnostics.confirmedSwings.filter(
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

  const anchorCandidates = mergeCandidates(rawCandidates);

  if (anchorCandidates.length === 0) {
    return {
      status: "NO_ANCHOR",
      anchorSelection: "NO_SELECTION",
      anchorCandidates: [],
      selectedAnchorSource: null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: true,
      reasons: ["No anchor candidates within evaluation scope."],
    };
  }

  let anchorSelection: OpenStructuralLegAnchorSelection = "NO_SELECTION";
  let selected: OpenStructuralLegAnchorCandidate | null = null;
  if (anchorCandidates.length === 1) {
    anchorSelection = "SELECTED";
    selected = anchorCandidates[0]!;
  } else {
    anchorSelection = "AMBIGUOUS";
    reasons.push(
      `Multiple distinct anchor identities: ${anchorCandidates.map(candidateKey).join(", ")}.`
    );
  }

  if (!selected) {
    return {
      status: "AMBIGUOUS_ANCHOR",
      anchorSelection,
      anchorCandidates,
      selectedAnchorSource: null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: anchorCandidates.every((c) => c.futureSafe),
      reasons,
    };
  }

  if (selected.anchorIndex >= evaluationBarIndex) {
    reasons.push("anchorIndex equals evaluationBarIndex; no observed span.");
    return {
      status: "NO_OBSERVED_SPAN",
      anchorSelection,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: selected.futureSafe,
      reasons,
    };
  }

  const range = pricePathRange(
    effectiveCandles,
    selected.anchorIndex,
    evaluationBarIndex
  );
  if (!range) {
    return {
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      leg: null,
      observationSpanBars: 0,
      futureSafe: false,
      reasons: [...reasons, "Could not compute observed price path range."],
    };
  }

  const leg = buildLeg(
    selected,
    evaluationBarIndex,
    evaluationPrice as number,
    range
  );

  const futureSafe =
    leg.futureSafe &&
    leg.anchorIndex <= evaluationBarIndex &&
    leg.observationEndIndex <= evaluationBarIndex;

  return {
    status: "AVAILABLE",
    anchorSelection,
    anchorCandidates,
    selectedAnchorSource: selected.sources.length === 1
      ? selected.sources[0]!
      : null,
    leg: { ...leg, futureSafe },
    observationSpanBars: leg.observationSpanBars,
    futureSafe,
    reasons: [
      ...reasons,
      "Open leg spans confirmed anchor through closed evaluation bar only.",
    ],
  };
}
