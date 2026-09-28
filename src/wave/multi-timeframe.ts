import { analyzeWaveWithDiagnostics } from "./analysis-pipeline";
import type { WaveDiagnostics } from "./wave-diagnostics";
import type { FocusView, StructureKind, WavePresentationState } from "./presentation-state";
import type { Candle, TrendDirection, WaveAnalysis, WaveEngineOptions } from "./types";

export type MultiTimeframeRelationshipKind =
  | "ALIGNED"
  | "NESTED_POSSIBLE"
  | "DIVERGENT"
  | "INSUFFICIENT_CONTEXT";

export type TrendComparisonKind = "SAME" | "DIFFERENT" | "PARTIAL_NEUTRAL";

export interface TimeWindow {
  startTime: number;
  endTime: number;
}

export interface TimeAlignmentView {
  higher: TimeWindow;
  lower: TimeWindow;
  overlap: TimeWindow | null;
  overlapDurationMs: number;
}

export interface FocusContextView {
  structure: StructureKind | null;
  wave: FocusView["wave"] | null;
  status: FocusView["status"] | null;
  confidence: number | null;
  startIndex: number | null;
  endIndex: number | null;
  startPrice: number | null;
  endPrice: number | null;
  startTime: number | null;
  endTime: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
}

export interface TimeframeWaveBundle {
  timeframeId: string;
  candleCount: number;
  timeWindow: TimeWindow;
  analysis: WaveAnalysis;
  presentation: WavePresentationState;
  diagnostics: WaveDiagnostics;
  primaryFocus: FocusContextView;
  alternativeFocus: FocusContextView;
}

export interface TrendAlignmentView {
  higherTrend: TrendDirection;
  lowerTrend: TrendDirection;
  comparison: TrendComparisonKind;
}

export interface MultiTimeframeRelationshipView {
  kind: MultiTimeframeRelationshipKind;
  summary: string;
}

export interface MultiTimeframeWaveState {
  schemaVersion: "1.0";
  symbol?: string;
  higherTimeframe: TimeframeWaveBundle;
  lowerTimeframe: TimeframeWaveBundle;
  trendAlignment: TrendAlignmentView;
  relationship: MultiTimeframeRelationshipView;
  timeAlignment: TimeAlignmentView;
  notes: string[];
}

export interface MultiTimeframeConfig {
  higherTimeframeId: string;
  lowerTimeframeId: string;
}

export const DEFAULT_MULTI_TIMEFRAME_CONFIG: MultiTimeframeConfig = {
  higherTimeframeId: "1H",
  lowerTimeframeId: "15M",
};

const MIN_CANDLES_FOR_CONTEXT = 2;

function timeWindowFromCandles(candles: Candle[]): TimeWindow {
  if (candles.length === 0) {
    return { startTime: 0, endTime: 0 };
  }
  return {
    startTime: candles[0].time,
    endTime: candles[candles.length - 1].time,
  };
}

function overlapWindows(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const startTime = Math.max(a.startTime, b.startTime);
  const endTime = Math.min(a.endTime, b.endTime);
  if (endTime < startTime) {
    return null;
  }
  return { startTime, endTime };
}

function priceRangeOnSegment(
  candles: Candle[],
  startIndex: number | null,
  endIndex: number | null
): { low: number | null; high: number | null } {
  if (
    startIndex === null ||
    endIndex === null ||
    candles.length === 0
  ) {
    return { low: null, high: null };
  }
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
  let low = Infinity;
  let high = -Infinity;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!c) {
      continue;
    }
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
  }
  if (!Number.isFinite(low)) {
    return { low: null, high: null };
  }
  return { low, high };
}

function emptyFocus(): FocusContextView {
  return {
    structure: null,
    wave: null,
    status: null,
    confidence: null,
    startIndex: null,
    endIndex: null,
    startPrice: null,
    endPrice: null,
    startTime: null,
    endTime: null,
    priceRangeLow: null,
    priceRangeHigh: null,
  };
}

export function focusContextFromDiagnostics(
  candles: Candle[],
  presentation: WavePresentationState,
  diagnostics: WaveDiagnostics,
  role: "primary" | "alternative"
): FocusContextView {
  const focus =
    role === "primary"
      ? presentation.primary
      : presentation.alternative;
  if (!focus) {
    return emptyFocus();
  }
  const diagFocus =
    role === "primary"
      ? diagnostics.focus.primary
      : diagnostics.focus.alternative;
  const range = priceRangeOnSegment(
    candles,
    focus.startIndex,
    focus.endIndex
  );
  return {
    structure: focus.structure,
    wave: focus.wave,
    status: focus.status,
    confidence: focus.confidence,
    startIndex: focus.startIndex,
    endIndex: focus.endIndex,
    startPrice: diagFocus?.startPrice ?? null,
    endPrice: diagFocus?.endPrice ?? null,
    startTime: diagFocus?.startTime ?? null,
    endTime: diagFocus?.endTime ?? null,
    priceRangeLow: range.low,
    priceRangeHigh: range.high,
  };
}

export function compareTrends(
  higherTrend: TrendDirection,
  lowerTrend: TrendDirection
): TrendComparisonKind {
  if (higherTrend === "NEUTRAL" || lowerTrend === "NEUTRAL") {
    return "PARTIAL_NEUTRAL";
  }
  return higherTrend === lowerTrend ? "SAME" : "DIFFERENT";
}

export function classifyMultiTimeframeRelationship(input: {
  higherCandleCount: number;
  lowerCandleCount: number;
  higherTrend: TrendDirection;
  lowerTrend: TrendDirection;
  higherPrimary: FocusContextView;
  lowerPrimary: FocusContextView;
}): MultiTimeframeRelationshipView {
  const notes: string[] = [];

  if (
    input.higherCandleCount < MIN_CANDLES_FOR_CONTEXT ||
    input.lowerCandleCount < MIN_CANDLES_FOR_CONTEXT
  ) {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary: "Not enough closed candles on one or both timeframes.",
    };
  }

  if (!input.higherPrimary.wave || !input.lowerPrimary.wave) {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary: "Primary focus missing on higher or lower timeframe.",
    };
  }

  const trendCmp = compareTrends(input.higherTrend, input.lowerTrend);

  if (trendCmp === "DIFFERENT") {
    return {
      kind: "DIVERGENT",
      summary:
        "Higher and lower timeframe trends differ (non-neutral). Wave labels are not compared directly.",
    };
  }

  const hStruct = input.higherPrimary.structure;
  const lStruct = input.lowerPrimary.structure;

  if (
    hStruct &&
    lStruct &&
    hStruct !== lStruct
  ) {
    return {
      kind: "NESTED_POSSIBLE",
      summary:
        "Primary structure kinds differ (e.g. impulse vs corrective). A lower-timeframe leg may nest inside higher-timeframe structure — not mapped in this checkpoint.",
    };
  }

  if (trendCmp === "PARTIAL_NEUTRAL") {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary:
        "At least one timeframe trend is NEUTRAL; relationship is descriptive only.",
    };
  }

  return {
    kind: "ALIGNED",
    summary:
      "Trend direction matches and primary structure kinds match. Label-level mapping is not performed.",
  };
}

export function buildTimeframeBundle(
  candles: Candle[],
  timeframeId: string,
  options?: WaveEngineOptions
): TimeframeWaveBundle {
  const { analysis, presentation, diagnostics } = analyzeWaveWithDiagnostics(
    candles,
    options
  );
  return {
    timeframeId,
    candleCount: candles.length,
    timeWindow: timeWindowFromCandles(candles),
    analysis,
    presentation,
    diagnostics,
    primaryFocus: focusContextFromDiagnostics(
      candles,
      presentation,
      diagnostics,
      "primary"
    ),
    alternativeFocus: focusContextFromDiagnostics(
      candles,
      presentation,
      diagnostics,
      "alternative"
    ),
  };
}

function buildNotes(
  trend: TrendAlignmentView,
  relationship: MultiTimeframeRelationshipView
): string[] {
  const notes: string[] = [];
  if (
    trend.comparison === "DIFFERENT" &&
    trend.higherTrend !== "NEUTRAL" &&
    trend.lowerTrend !== "NEUTRAL"
  ) {
    notes.push(
      "Short-term structure differs from higher timeframe."
    );
  }
  if (trend.comparison === "PARTIAL_NEUTRAL") {
    notes.push(
      "One or both timeframes report NEUTRAL trend; compare focus legs with caution."
    );
  }
  notes.push(relationship.summary);
  notes.push(
    "Multi-timeframe view does not map parent/child waves or produce trade signals."
  );
  return notes;
}

export function analyzeMultiTimeframe(
  higherCandles: Candle[],
  lowerCandles: Candle[],
  config: MultiTimeframeConfig = DEFAULT_MULTI_TIMEFRAME_CONFIG,
  options?: {
    higherEngineOptions?: WaveEngineOptions;
    lowerEngineOptions?: WaveEngineOptions;
    symbol?: string;
  }
): MultiTimeframeWaveState {
  const higherTimeframe = buildTimeframeBundle(
    higherCandles,
    config.higherTimeframeId,
    options?.higherEngineOptions
  );
  const lowerTimeframe = buildTimeframeBundle(
    lowerCandles,
    config.lowerTimeframeId,
    options?.lowerEngineOptions
  );

  const trendAlignment: TrendAlignmentView = {
    higherTrend: higherTimeframe.presentation.marketTrend,
    lowerTrend: lowerTimeframe.presentation.marketTrend,
    comparison: compareTrends(
      higherTimeframe.presentation.marketTrend,
      lowerTimeframe.presentation.marketTrend
    ),
  };

  const relationship = classifyMultiTimeframeRelationship({
    higherCandleCount: higherTimeframe.candleCount,
    lowerCandleCount: lowerTimeframe.candleCount,
    higherTrend: trendAlignment.higherTrend,
    lowerTrend: trendAlignment.lowerTrend,
    higherPrimary: higherTimeframe.primaryFocus,
    lowerPrimary: lowerTimeframe.primaryFocus,
  });

  const higherWindow = higherTimeframe.timeWindow;
  const lowerWindow = lowerTimeframe.timeWindow;
  const overlap = overlapWindows(higherWindow, lowerWindow);

  return {
    schemaVersion: "1.0",
    symbol: options?.symbol,
    higherTimeframe,
    lowerTimeframe,
    trendAlignment,
    relationship,
    timeAlignment: {
      higher: higherWindow,
      lower: lowerWindow,
      overlap,
      overlapDurationMs: overlap
        ? overlap.endTime - overlap.startTime
        : 0,
    },
    notes: buildNotes(trendAlignment, relationship),
  };
}
