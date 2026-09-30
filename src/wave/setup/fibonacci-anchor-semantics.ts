import { fibExtensionPrice } from "../fibonacci";
import type { FibExtensionLevel } from "../fibonacci";
import type {
  FibonacciDiagnostic,
  WaveDiagnostics,
  WaveLegDiagnostic,
} from "../wave-diagnostics";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type {
  FibonacciAnchorModelSupportVerdict,
  FibonacciProjectionAnchorModel,
} from "./fibonacci-anchor-semantics-types";
import { FIBONACCI_DIAGNOSTIC_PROJECTION_RATIOS } from "./fibonacci-anchor-semantics-types";

export interface W1W2FibonacciAnchors {
  w1StartIndex: number;
  w1EndIndex: number;
  w2EndIndex: number;
  /** diagnostics.fibonacci.rangeStart — W1 start candle extreme */
  w1StartPriceCandleExtreme: number;
  /** diagnostics.fibonacci.rangeEnd — W1 end candle extreme */
  w1EndPriceCandleExtreme: number;
  /** diagnostics.fibonacci.actualRetracePrice — W2 end candle extreme */
  w2EndPriceCandleExtreme: number | null;
}

export interface ImpulsePivotDiagnosticRow {
  pivotId: "p0" | "p1" | "p2" | "p3" | "p4" | "p5";
  waveBoundary: string;
  index: number | null;
  swingPrice: number | null;
  swingType: string | null;
  confirmed: boolean | null;
}

export interface DiagnosticsVsPivotComparison {
  w1StartPriceDelta: number | null;
  w1EndPriceDelta: number | null;
  w2EndPriceDelta: number | null;
  note: string;
}

export interface FibonacciAnchorLookaheadAudit {
  evaluationBarIndex: number;
  maxAnchorIndex: number | null;
  safe: boolean;
  findings: string[];
}

export interface DiagnosticProjectionRow {
  ratio: FibExtensionLevel;
  price: number | null;
}

export interface DiagnosticProjectionGeometry {
  aboveSegmentEnvelope: boolean | null;
  aboveEntryReference: boolean | null;
  segmentEnvelopeHigh: number | null;
  segmentEnvelopeLow: number | null;
  entryReferencePrice: number | null;
}

export function extractW1W2FibonacciAnchors(
  fib: FibonacciDiagnostic | undefined
): W1W2FibonacciAnchors | null {
  if (!fib?.available) {
    return null;
  }
  const {
    wave1StartIndex,
    wave1EndIndex,
    wave2EndIndex,
    rangeStart,
    rangeEnd,
    actualRetracePrice,
  } = fib;
  if (
    wave1StartIndex === undefined ||
    wave1EndIndex === undefined ||
    wave2EndIndex === undefined ||
    rangeStart === undefined ||
    rangeEnd === undefined ||
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd)
  ) {
    return null;
  }
  return {
    w1StartIndex: wave1StartIndex,
    w1EndIndex: wave1EndIndex,
    w2EndIndex: wave2EndIndex,
    w1StartPriceCandleExtreme: rangeStart,
    w1EndPriceCandleExtreme: rangeEnd,
    w2EndPriceCandleExtreme:
      actualRetracePrice !== undefined && Number.isFinite(actualRetracePrice)
        ? actualRetracePrice
        : null,
  };
}

function selectedImpulseLeg(
  waveLegs: WaveLegDiagnostic[],
  label: string
): WaveLegDiagnostic | undefined {
  return waveLegs.find(
    (l) =>
      l.structure === "IMPULSE" &&
      l.scenario === "SELECTED" &&
      l.label === label
  );
}

/**
 * Maps detector pivots p0–p5 to W1–W5 boundaries (wave-detector buildImpulseFromPivots).
 */
export function buildImpulsePivotDiagnostics(
  waveLegs: WaveLegDiagnostic[] | undefined,
  confirmedSwings: WaveDiagnostics["confirmedSwings"],
  evaluationBarIndex: number
): ImpulsePivotDiagnosticRow[] {
  const legs = waveLegs ?? [];
  const w1 = selectedImpulseLeg(legs, "1");
  const w2 = selectedImpulseLeg(legs, "2");
  const w3 = selectedImpulseLeg(legs, "3");
  const w4 = selectedImpulseLeg(legs, "4");
  const w5 = selectedImpulseLeg(legs, "5");

  const pivotAt = (
    pivotId: ImpulsePivotDiagnosticRow["pivotId"],
    waveBoundary: string,
    index: number | undefined
  ): ImpulsePivotDiagnosticRow => {
    if (index === undefined) {
      return {
        pivotId,
        waveBoundary,
        index: null,
        swingPrice: null,
        swingType: null,
        confirmed: null,
      };
    }
    if (index > evaluationBarIndex) {
      return {
        pivotId,
        waveBoundary,
        index,
        swingPrice: null,
        swingType: null,
        confirmed: null,
      };
    }
    const swing = confirmedSwings.find((s) => s.index === index);
    return {
      pivotId,
      waveBoundary,
      index,
      swingPrice: swing?.price ?? null,
      swingType: swing?.type ?? null,
      confirmed: swing ? true : null,
    };
  };

  return [
    pivotAt("p0", "W1 start", w1?.startIndex),
    pivotAt("p1", "W1 end / W2 start", w1?.endIndex),
    pivotAt("p2", "W2 end / W3 start", w2?.endIndex),
    pivotAt("p3", "W3 end / W4 start", w3?.endIndex),
    pivotAt("p4", "W4 end / W5 start", w4?.endIndex),
    pivotAt("p5", "W5 end", w5?.endIndex),
  ];
}

export function compareDiagnosticsToPivotPrices(
  anchors: W1W2FibonacciAnchors,
  pivots: ImpulsePivotDiagnosticRow[]
): DiagnosticsVsPivotComparison {
  const p0 = pivots.find((p) => p.pivotId === "p0");
  const p1 = pivots.find((p) => p.pivotId === "p1");
  const p2 = pivots.find((p) => p.pivotId === "p2");
  const w1StartDelta =
    p0?.swingPrice != null
      ? anchors.w1StartPriceCandleExtreme - p0.swingPrice
      : null;
  const w1EndDelta =
    p1?.swingPrice != null
      ? anchors.w1EndPriceCandleExtreme - p1.swingPrice
      : null;
  const w2EndDelta =
    p2?.swingPrice != null && anchors.w2EndPriceCandleExtreme != null
      ? anchors.w2EndPriceCandleExtreme - p2.swingPrice
      : null;
  const anyDelta =
    (w1StartDelta !== null && Math.abs(w1StartDelta) > 1e-9) ||
    (w1EndDelta !== null && Math.abs(w1EndDelta) > 1e-9) ||
    (w2EndDelta !== null && Math.abs(w2EndDelta) > 1e-9);
  return {
    w1StartPriceDelta: w1StartDelta,
    w1EndPriceDelta: w1EndDelta,
    w2EndPriceDelta: w2EndDelta,
    note: anyDelta
      ? "Fibonacci diagnostic uses candle extremes at wave indices; waveLeg/swing prices may differ."
      : "Diagnostic candle extremes match swing prices at W1–W2 pivot indices (or pivots unavailable).",
  };
}

/** MODEL A — W1 origin via fibExtensionPrice(rangeStart, rangeEnd, ratio). */
export function diagnosticProjectModelA(
  anchors: W1W2FibonacciAnchors,
  ratio: FibExtensionLevel
): number {
  return fibExtensionPrice(
    anchors.w1StartPriceCandleExtreme,
    anchors.w1EndPriceCandleExtreme,
    ratio
  );
}

/** MODEL B — diagnostic only: W2 end + W1 delta × ratio (not fibExtensionPrice). */
export function diagnosticProjectModelB(
  anchors: W1W2FibonacciAnchors,
  ratio: FibExtensionLevel
): number | null {
  if (anchors.w2EndPriceCandleExtreme === null) {
    return null;
  }
  const w1Delta =
    anchors.w1EndPriceCandleExtreme - anchors.w1StartPriceCandleExtreme;
  return anchors.w2EndPriceCandleExtreme + w1Delta * ratio;
}

export function computeProjectionForAnchorModel(
  anchorModel: FibonacciProjectionAnchorModel,
  anchors: W1W2FibonacciAnchors,
  ratio: FibExtensionLevel
): number | null {
  switch (anchorModel) {
    case "DIAGNOSTICS_W1_LEG_RANGE":
      return diagnosticProjectModelA(anchors, ratio);
    case "W2_END_BASED_W1_DELTA":
      return diagnosticProjectModelB(anchors, ratio);
    default:
      return null;
  }
}

export function anchorModelSupportVerdict(
  model: FibonacciProjectionAnchorModel
): FibonacciAnchorModelSupportVerdict {
  switch (model) {
    case "DIAGNOSTICS_W1_LEG_RANGE":
      return "SUPPORTED_BY_EXISTING_CONTRACT";
    case "W2_END_BASED_W1_DELTA":
      return "REQUIRES_DOMAIN_POLICY";
    default:
      return "UNSUPPORTED";
  }
}

export function auditFibonacciAnchorLookahead(input: {
  evaluationBarIndex: number;
  fib?: FibonacciDiagnostic;
  confirmedSwingsAtBar: readonly { index: number }[];
  sourceScenarioStartIndex?: number;
  sourceScenarioEndIndex?: number;
}): FibonacciAnchorLookaheadAudit {
  const findings: string[] = [];
  let maxAnchor: number | null = null;

  const bump = (idx: number | undefined) => {
    if (idx === undefined || !Number.isFinite(idx)) {
      return;
    }
    maxAnchor = maxAnchor === null ? idx : Math.max(maxAnchor, idx);
    if (idx > input.evaluationBarIndex) {
      findings.push(
        `POTENTIAL_LOOKAHEAD_RISK: fib/wave index ${idx} > evaluationBarIndex ${input.evaluationBarIndex}.`
      );
    }
  };

  if (input.fib?.available) {
    bump(input.fib.wave1StartIndex);
    bump(input.fib.wave1EndIndex);
    bump(input.fib.wave2EndIndex);
  }

  for (const s of input.confirmedSwingsAtBar) {
    bump(s.index);
  }
  bump(input.sourceScenarioStartIndex);
  bump(input.sourceScenarioEndIndex);

  const safe =
    findings.length === 0 &&
    (maxAnchor === null || maxAnchor <= input.evaluationBarIndex);

  if (
    input.fib?.available &&
    findings.length === 0 &&
    maxAnchor !== null &&
    maxAnchor <= input.evaluationBarIndex
  ) {
    findings.push(
      "Fibonacci diagnostic indices are within evaluation bar; note bundle fibonacci is built from full-series engine pass (not re-run per plan)."
    );
  }

  return {
    evaluationBarIndex: input.evaluationBarIndex,
    maxAnchorIndex: maxAnchor,
    safe,
    findings,
  };
}

export function buildDiagnosticRatioProjections(
  anchors: W1W2FibonacciAnchors
): {
  modelA: DiagnosticProjectionRow[];
  modelB: DiagnosticProjectionRow[];
} {
  const modelA = FIBONACCI_DIAGNOSTIC_PROJECTION_RATIOS.map((ratio) => ({
    ratio,
    price: diagnosticProjectModelA(anchors, ratio),
  }));
  const modelB = FIBONACCI_DIAGNOSTIC_PROJECTION_RATIOS.map((ratio) => ({
    ratio,
    price: diagnosticProjectModelB(anchors, ratio),
  }));
  return { modelA, modelB };
}

export function diagnosticProjectionGeometry(
  plan: EntryPlanCandidate,
  targetPrice: number | null,
  entryReferencePrice: number | null
): DiagnosticProjectionGeometry {
  const segLow = Math.min(
    plan.sourceScenario.startPrice,
    plan.sourceScenario.endPrice
  );
  const segHigh = Math.max(
    plan.sourceScenario.startPrice,
    plan.sourceScenario.endPrice
  );
  if (targetPrice === null || !Number.isFinite(targetPrice)) {
    return {
      aboveSegmentEnvelope: null,
      aboveEntryReference: null,
      segmentEnvelopeHigh: segHigh,
      segmentEnvelopeLow: segLow,
      entryReferencePrice,
    };
  }
  const bullish = plan.directionalBias === "BULLISH";
  return {
    aboveSegmentEnvelope: bullish ? targetPrice > segHigh : targetPrice < segLow,
    aboveEntryReference:
      entryReferencePrice !== null && Number.isFinite(entryReferencePrice)
        ? bullish
          ? targetPrice > entryReferencePrice
          : targetPrice < entryReferencePrice
        : null,
    segmentEnvelopeHigh: segHigh,
    segmentEnvelopeLow: segLow,
    entryReferencePrice,
  };
}
