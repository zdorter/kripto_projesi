import { fibConformanceScore, nearestFibMatch } from "./fibonacci";
import { mergeSwingConfig, detectSwings } from "./swing-detector";
import {
  classifyHighStructure,
  classifyLowStructure,
  detectMarketStructures,
  detectTrend,
} from "./trend-detector";
import {
  Candle,
  MarketStructure,
  SwingPoint,
  TrendDirection,
  WaveCandidate,
  WaveEngineOptions,
  WaveLabel,
} from "./types";
import type { FocusView, SegmentOverlapView, WavePresentationState } from "./presentation-state";
import type { WaveLegView } from "./presentation-state";

const IMPULSE_LABELS: WaveLabel[] = ["1", "2", "3", "4", "5"];

export interface SwingDiagnosticRow {
  index: number;
  type: "HIGH" | "LOW";
  price: number;
  time: number;
  strength: number;
}

export interface StructurePairDiagnostic {
  kind: "HIGH" | "LOW";
  fromIndex: number;
  toIndex: number;
  fromPrice: number;
  toPrice: number;
  structure: MarketStructure;
}

export interface TrendSourceDiagnostic {
  marketTrend: TrendDirection;
  lastHighPair?: {
    prevIndex: number;
    lastIndex: number;
    prevPrice: number;
    lastPrice: number;
    structure: MarketStructure;
  };
  lastLowPair?: {
    prevIndex: number;
    lastIndex: number;
    prevPrice: number;
    lastPrice: number;
    structure: MarketStructure;
  };
  lastConfirmedSwing?: {
    index: number;
    type: "HIGH" | "LOW";
    price: number;
    time: number;
  };
  trendRuleSummary: string;
}

export interface WaveLegDiagnostic {
  structure: "IMPULSE" | "CORRECTIVE";
  scenario: "SELECTED" | "RIVAL" | "SELECTED_ALTERNATIVE";
  label: WaveLabel;
  status: WaveCandidate["status"];
  confidence: number;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
}

export interface FibonacciDiagnostic {
  /** Same inputs as `computeConfidence` fibonacci component (wave 1–2 retracement). */
  available: boolean;
  impulseBullish?: boolean;
  wave1StartIndex?: number;
  wave1EndIndex?: number;
  wave2EndIndex?: number;
  rangeStart?: number;
  rangeEnd?: number;
  actualRetracePrice?: number;
  nearestMatch?: {
    level: number;
    kind: "retracement" | "extension";
    distanceRatio: number;
  } | null;
  conformanceScore?: number;
  note?: string;
}

export interface FocusDiagnostic {
  role: "PRIMARY" | "ALTERNATIVE";
  structure: FocusView["structure"];
  wave: WaveLabel;
  status: FocusView["status"];
  confidence: number;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
  selectionReason: string;
}

export interface OverlapDiagnostic extends SegmentOverlapView {
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
  summary: string;
}

export interface WaveDiagnostics {
  swingConfig: ReturnType<typeof mergeSwingConfig>;
  confirmedSwingCount: number;
  confirmedSwings: SwingDiagnosticRow[];
  structurePairs: StructurePairDiagnostic[];
  allStructures: MarketStructure[];
  trendSource: TrendSourceDiagnostic;
  waveLegs: WaveLegDiagnostic[];
  fibonacci: FibonacciDiagnostic;
  focus: {
    primary: FocusDiagnostic | null;
    alternative: FocusDiagnostic | null;
  };
  overlaps: OverlapDiagnostic[];
  presentation: WavePresentationState;
}

function swingPriceAt(
  candles: Candle[],
  swings: SwingPoint[],
  index: number
): number {
  const swing = swings.find((s) => s.index === index);
  if (swing) {
    return swing.price;
  }
  const c = candles[index];
  return c?.close ?? NaN;
}

function legFromView(
  leg: WaveLegView,
  candles: Candle[],
  swings: SwingPoint[]
): Pick<
  WaveLegDiagnostic,
  "startPrice" | "endPrice" | "startTime" | "endTime"
> {
  const startC = candles[leg.startIndex];
  const endC = candles[leg.endIndex];
  return {
    startPrice: swingPriceAt(candles, swings, leg.startIndex),
    endPrice: swingPriceAt(candles, swings, leg.endIndex),
    startTime: startC?.time ?? 0,
    endTime: endC?.time ?? 0,
  };
}

function buildStructurePairs(swings: SwingPoint[]): StructurePairDiagnostic[] {
  const confirmed = swings.filter((s) => s.confirmed);
  const highs = confirmed.filter((s) => s.type === "HIGH");
  const lows = confirmed.filter((s) => s.type === "LOW");
  const pairs: StructurePairDiagnostic[] = [];

  for (let i = 1; i < highs.length; i++) {
    pairs.push({
      kind: "HIGH",
      fromIndex: highs[i - 1].index,
      toIndex: highs[i].index,
      fromPrice: highs[i - 1].price,
      toPrice: highs[i].price,
      structure: classifyHighStructure(highs[i - 1], highs[i]),
    });
  }
  for (let i = 1; i < lows.length; i++) {
    pairs.push({
      kind: "LOW",
      fromIndex: lows[i - 1].index,
      toIndex: lows[i].index,
      fromPrice: lows[i - 1].price,
      toPrice: lows[i].price,
      structure: classifyLowStructure(lows[i - 1], lows[i]),
    });
  }
  return pairs;
}

function buildTrendSource(
  swings: SwingPoint[],
  trend: TrendDirection
): TrendSourceDiagnostic {
  const confirmed = swings.filter((s) => s.confirmed);
  const highs = confirmed.filter((s) => s.type === "HIGH");
  const lows = confirmed.filter((s) => s.type === "LOW");

  let lastHighPair: TrendSourceDiagnostic["lastHighPair"];
  let lastLowPair: TrendSourceDiagnostic["lastLowPair"];

  if (highs.length >= 2) {
    const prev = highs[highs.length - 2];
    const last = highs[highs.length - 1];
    lastHighPair = {
      prevIndex: prev.index,
      lastIndex: last.index,
      prevPrice: prev.price,
      lastPrice: last.price,
      structure: classifyHighStructure(prev, last),
    };
  }
  if (lows.length >= 2) {
    const prev = lows[lows.length - 2];
    const last = lows[lows.length - 1];
    lastLowPair = {
      prevIndex: prev.index,
      lastIndex: last.index,
      prevPrice: prev.price,
      lastPrice: last.price,
      structure: classifyLowStructure(prev, last),
    };
  }

  const lastSwing = confirmed[confirmed.length - 1];
  const lastConfirmedSwing = lastSwing
    ? {
        index: lastSwing.index,
        type: lastSwing.type,
        price: lastSwing.price,
        time: lastSwing.time,
      }
    : undefined;

  let trendRuleSummary =
    "Insufficient confirmed swings for trend (need 2 highs and 2 lows).";
  if (lastHighPair && lastLowPair && lastConfirmedSwing) {
    trendRuleSummary =
      `Trend uses last high pair → ${lastHighPair.structure}, ` +
      `last low pair → ${lastLowPair.structure}, ` +
      `last confirmed swing → ${lastConfirmedSwing.type}. ` +
      `Result: ${trend}.`;
  }

  return {
    marketTrend: trend,
    lastHighPair,
    lastLowPair,
    lastConfirmedSwing,
    trendRuleSummary,
  };
}

function buildFibonacciDiagnostic(
  candles: Candle[],
  impulseWaves: WaveCandidate[],
  impulseBullish: boolean
): FibonacciDiagnostic {
  const wave1 = impulseWaves.find((w) => w.label === "1");
  const wave2 = impulseWaves.find((w) => w.label === "2");
  if (!wave1 || !wave2) {
    return {
      available: false,
      note: "Selected impulse waves 1–2 required for confidence fibonacci component.",
    };
  }

  const start = impulseBullish
    ? candles[wave1.startIndex].low
    : candles[wave1.startIndex].high;
  const end = impulseBullish
    ? candles[wave1.endIndex].high
    : candles[wave1.endIndex].low;
  const actual = impulseBullish
    ? candles[wave2.endIndex].low
    : candles[wave2.endIndex].high;

  const match = nearestFibMatch(start, end, actual, impulseBullish);
  const conformanceScore = fibConformanceScore(match);

  return {
    available: true,
    impulseBullish,
    wave1StartIndex: wave1.startIndex,
    wave1EndIndex: wave1.endIndex,
    wave2EndIndex: wave2.endIndex,
    rangeStart: start,
    rangeEnd: end,
    actualRetracePrice: actual,
    nearestMatch: match
      ? {
          level: match.level,
          kind: match.kind,
          distanceRatio: match.distanceRatio,
        }
      : null,
    conformanceScore,
    note: "Mirrors computeConfidence fibonacciScore inputs (exported fib helpers only).",
  };
}

function indicesToPrices(
  candles: Candle[],
  swings: SwingPoint[],
  startIndex: number,
  endIndex: number
): Pick<WaveLegDiagnostic, "startPrice" | "endPrice" | "startTime" | "endTime"> {
  const startC = candles[startIndex];
  const endC = candles[endIndex];
  return {
    startPrice: swingPriceAt(candles, swings, startIndex),
    endPrice: swingPriceAt(candles, swings, endIndex),
    startTime: startC?.time ?? 0,
    endTime: endC?.time ?? 0,
  };
}

function focusDiagnostic(
  role: "PRIMARY" | "ALTERNATIVE",
  focus: FocusView,
  candles: Candle[],
  swings: SwingPoint[]
): FocusDiagnostic {
  const prices = indicesToPrices(
    candles,
    swings,
    focus.startIndex,
    focus.endIndex
  );
  return {
    role,
    structure: focus.structure,
    wave: focus.wave,
    status: focus.status,
    confidence: focus.confidence,
    startIndex: focus.startIndex,
    endIndex: focus.endIndex,
    ...prices,
    selectionReason: focus.selectionReason,
  };
}

function buildOverlaps(
  presentation: WavePresentationState,
  candles: Candle[],
  swings: SwingPoint[]
): OverlapDiagnostic[] {
  return presentation.overlaps.map((o) => {
    const impulse = o.legs.find((l) => l.structure === "IMPULSE");
    const corr = o.legs.find((l) => l.structure === "CORRECTIVE");
    const title =
      impulse && corr
        ? `Wave ${impulse.label} ↔ Wave ${corr.label}`
        : o.legs.map((l) => `${l.structure} ${l.label}`).join(" ↔ ");
    const prices = indicesToPrices(candles, swings, o.startIndex, o.endIndex);
    return {
      ...o,
      ...prices,
      summary: title,
    };
  });
}

export function buildWaveDiagnostics(
  candles: Candle[],
  presentation: WavePresentationState,
  impulseBullish: boolean,
  options?: WaveEngineOptions
): WaveDiagnostics {
  const swingConfig = mergeSwingConfig(options?.swing);
  const swings = detectSwings(candles, swingConfig);
  const trend = detectTrend(swings);
  const confirmedSwings = swings
    .filter((s) => s.confirmed)
    .map((s) => ({
      index: s.index,
      type: s.type,
      price: s.price,
      time: s.time,
      strength: s.strength,
    }));

  const impulseWaves = presentation.engine.flatWaves.filter((w) =>
    IMPULSE_LABELS.includes(w.label)
  );

  const waveLegs: WaveLegDiagnostic[] = [];
  const pushTrack = (
    track: { legs: WaveLegView[] } | null,
    structure: "IMPULSE" | "CORRECTIVE"
  ) => {
    if (!track) {
      return;
    }
    for (const leg of track.legs) {
      waveLegs.push({
        structure,
        scenario: leg.scenario,
        label: leg.label,
        status: leg.status,
        confidence: leg.confidence,
        startIndex: leg.startIndex,
        endIndex: leg.endIndex,
        ...legFromView(leg, candles, swings),
      });
    }
  };

  pushTrack(presentation.tracks.selectedImpulse, "IMPULSE");
  pushTrack(presentation.tracks.corrective, "CORRECTIVE");
  pushTrack(presentation.tracks.rivalImpulse, "IMPULSE");

  return {
    swingConfig,
    confirmedSwingCount: confirmedSwings.length,
    confirmedSwings,
    structurePairs: buildStructurePairs(swings),
    allStructures: detectMarketStructures(swings),
    trendSource: buildTrendSource(swings, trend),
    waveLegs,
    fibonacci: buildFibonacciDiagnostic(candles, impulseWaves, impulseBullish),
    focus: {
      primary: presentation.primary
        ? focusDiagnostic("PRIMARY", presentation.primary, candles, swings)
        : null,
      alternative: presentation.alternative
        ? focusDiagnostic(
            "ALTERNATIVE",
            presentation.alternative,
            candles,
            swings
          )
        : null,
    },
    overlaps: buildOverlaps(presentation, candles, swings),
    presentation,
  };
}
