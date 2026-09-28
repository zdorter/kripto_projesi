import type { MultiTimeframeWaveState, TimeframeWaveBundle } from "./multi-timeframe";
import type { WaveLegDiagnostic } from "./wave-diagnostics";
import type {
  Candle,
  WaveCandidate,
  WaveLabel,
  WaveStatus,
} from "./types";
import type { StructureKind } from "./presentation-state";

export const HIERARCHY_WAVE_LABELS: WaveLabel[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "A",
  "B",
  "C",
];

export type TimeRelationKind =
  | "TIME_CONTAINED"
  | "TIME_OVERLAPPING"
  | "TIME_DISJOINT"
  | "INSUFFICIENT_CONTEXT";

export type PriceRelationKind =
  | "PRICE_CONTAINED"
  | "PRICE_OVERLAPPING"
  | "PRICE_DISJOINT"
  | "INSUFFICIENT_CONTEXT";

export type CandidateNestingKind =
  | "NESTED_CANDIDATE"
  | "POSSIBLE_NESTING"
  | "OVERLAPPING_CONTEXT"
  | "NO_RELATIONSHIP"
  | "INSUFFICIENT_CONTEXT";

export interface HierarchyWaveSegment {
  timeframeId: string;
  structure: StructureKind;
  label: WaveLabel;
  status: WaveStatus;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  lowPrice: number;
  highPrice: number;
  invalidated: boolean;
}

export interface WaveHierarchyCandidate {
  higherWave: HierarchyWaveSegment;
  lowerWave: HierarchyWaveSegment;
  timeRelation: TimeRelationKind;
  priceRelation: PriceRelationKind;
  relationship: CandidateNestingKind;
  reason: string;
}

export interface WaveHierarchyReport {
  schemaVersion: "1.0";
  symbol?: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  trendContext: {
    higherTrend: string;
    lowerTrend: string;
  };
  primaryPair: WaveHierarchyCandidate | null;
  candidates: WaveHierarchyCandidate[];
  highlightedCandidates: WaveHierarchyCandidate[];
  counts: {
    totalPairs: number;
    nestedCandidate: number;
    possibleNesting: number;
    overlappingContext: number;
    noRelationship: number;
    insufficientContext: number;
  };
}

function structureForLabel(label: WaveLabel): StructureKind {
  return ["1", "2", "3", "4", "5"].includes(label)
    ? "IMPULSE"
    : "CORRECTIVE";
}

function segmentEnvelope(
  candles: Candle[],
  startIndex: number,
  endIndex: number
): { lowPrice: number; highPrice: number } {
  let low = Infinity;
  let high = -Infinity;
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!c) {
      continue;
    }
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
  }
  if (!Number.isFinite(low)) {
    return { lowPrice: 0, highPrice: 0 };
  }
  return { lowPrice: low, highPrice: high };
}

function pickLeg(
  legs: WaveLegDiagnostic[],
  label: WaveLabel
): WaveLegDiagnostic | undefined {
  const matches = legs.filter((l) => l.label === label);
  return (
    matches.find((l) => l.scenario === "SELECTED") ??
    matches.find((l) => l.scenario === "SELECTED_ALTERNATIVE") ??
    matches[0]
  );
}

function waveByLabel(
  waves: WaveCandidate[],
  label: WaveLabel
): WaveCandidate | undefined {
  return waves.find((w) => w.label === label);
}

export function buildHierarchySegment(
  bundle: TimeframeWaveBundle,
  candles: Candle[],
  label: WaveLabel
): HierarchyWaveSegment | null {
  const wave = waveByLabel(bundle.analysis.waves, label);
  if (!wave) {
    return null;
  }
  const leg = pickLeg(bundle.diagnostics.waveLegs, label);
  const startIndex = leg?.startIndex ?? wave.startIndex;
  const endIndex = leg?.endIndex ?? wave.endIndex;
  const envelope = segmentEnvelope(candles, startIndex, endIndex);
  const startC = candles[startIndex];
  const endC = candles[endIndex];

  return {
    timeframeId: bundle.timeframeId,
    structure: structureForLabel(label),
    label,
    status: wave.status,
    startIndex,
    endIndex,
    startTime: leg?.startTime ?? startC?.time ?? 0,
    endTime: leg?.endTime ?? endC?.time ?? 0,
    lowPrice: envelope.lowPrice,
    highPrice: envelope.highPrice,
    invalidated: wave.status === "INVALIDATED",
  };
}

function normalizedTimeSpan(
  startTime: number,
  endTime: number
): { start: number; end: number } {
  return {
    start: Math.min(startTime, endTime),
    end: Math.max(startTime, endTime),
  };
}

export function classifyTimeRelation(
  higher: HierarchyWaveSegment,
  lower: HierarchyWaveSegment
): TimeRelationKind {
  if (
    !higher.startTime ||
    !higher.endTime ||
    !lower.startTime ||
    !lower.endTime
  ) {
    return "INSUFFICIENT_CONTEXT";
  }
  const h = normalizedTimeSpan(higher.startTime, higher.endTime);
  const l = normalizedTimeSpan(lower.startTime, lower.endTime);
  if (l.start >= h.start && l.end <= h.end) {
    return "TIME_CONTAINED";
  }
  if (l.start <= h.end && l.end >= h.start) {
    return "TIME_OVERLAPPING";
  }
  return "TIME_DISJOINT";
}

export function classifyPriceRelation(
  higher: HierarchyWaveSegment,
  lower: HierarchyWaveSegment
): PriceRelationKind {
  if (
    !Number.isFinite(higher.lowPrice) ||
    !Number.isFinite(higher.highPrice) ||
    !Number.isFinite(lower.lowPrice) ||
    !Number.isFinite(lower.highPrice)
  ) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (
    lower.lowPrice >= higher.lowPrice &&
    lower.highPrice <= higher.highPrice
  ) {
    return "PRICE_CONTAINED";
  }
  const overlapLow = Math.max(higher.lowPrice, lower.lowPrice);
  const overlapHigh = Math.min(higher.highPrice, lower.highPrice);
  if (overlapHigh >= overlapLow) {
    return "PRICE_OVERLAPPING";
  }
  return "PRICE_DISJOINT";
}

export function classifyCandidateNesting(
  timeRelation: TimeRelationKind,
  priceRelation: PriceRelationKind
): CandidateNestingKind {
  if (
    timeRelation === "INSUFFICIENT_CONTEXT" ||
    priceRelation === "INSUFFICIENT_CONTEXT"
  ) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (timeRelation === "TIME_DISJOINT" || priceRelation === "PRICE_DISJOINT") {
    return "NO_RELATIONSHIP";
  }
  if (timeRelation === "TIME_CONTAINED") {
    if (priceRelation === "PRICE_CONTAINED") {
      return "NESTED_CANDIDATE";
    }
    if (priceRelation === "PRICE_OVERLAPPING") {
      return "POSSIBLE_NESTING";
    }
    return "NO_RELATIONSHIP";
  }
  return "OVERLAPPING_CONTEXT";
}

export function buildHierarchyReason(
  higher: HierarchyWaveSegment,
  lower: HierarchyWaveSegment,
  timeRelation: TimeRelationKind,
  priceRelation: PriceRelationKind,
  relationship: CandidateNestingKind
): string {
  const h = `${higher.timeframeId} ${higher.structure} Wave ${higher.label}`;
  const l = `${lower.timeframeId} ${lower.structure} Wave ${lower.label}`;
  if (relationship === "INSUFFICIENT_CONTEXT") {
    return `${l} vs ${h}: insufficient time or price context.`;
  }
  if (relationship === "NO_RELATIONSHIP") {
    return `${l} has no qualifying time/price overlap with ${h} (${timeRelation}, ${priceRelation}).`;
  }
  if (relationship === "NESTED_CANDIDATE") {
    return `${l} is time-contained within ${h} and its OHLC envelope lies inside ${h}'s price envelope (candidate only, not confirmed Elliott nesting).`;
  }
  if (relationship === "POSSIBLE_NESTING") {
    return `${l} is time-contained within ${h} and overlaps ${h}'s price envelope (candidate only).`;
  }
  return `${l} time-overlaps ${h} without full time containment (${timeRelation}, ${priceRelation}).`;
}

function compareCandidates(a: WaveHierarchyCandidate, b: WaveHierarchyCandidate): number {
  const hi = HIERARCHY_WAVE_LABELS.indexOf(a.higherWave.label);
  const hj = HIERARCHY_WAVE_LABELS.indexOf(b.higherWave.label);
  if (hi !== hj) {
    return hi - hj;
  }
  return (
    HIERARCHY_WAVE_LABELS.indexOf(a.lowerWave.label) -
    HIERARCHY_WAVE_LABELS.indexOf(b.lowerWave.label)
  );
}

export function buildCandidatePair(
  higher: HierarchyWaveSegment,
  lower: HierarchyWaveSegment
): WaveHierarchyCandidate {
  const timeRelation = classifyTimeRelation(higher, lower);
  const priceRelation = classifyPriceRelation(higher, lower);
  const relationship = classifyCandidateNesting(timeRelation, priceRelation);
  return {
    higherWave: higher,
    lowerWave: lower,
    timeRelation,
    priceRelation,
    relationship,
    reason: buildHierarchyReason(
      higher,
      lower,
      timeRelation,
      priceRelation,
      relationship
    ),
  };
}

export function buildCandidateWaveHierarchy(
  state: MultiTimeframeWaveState,
  higherCandles: Candle[],
  lowerCandles: Candle[]
): WaveHierarchyReport {
  const higherTf = state.higherTimeframe;
  const lowerTf = state.lowerTimeframe;

  const higherSegments = new Map<WaveLabel, HierarchyWaveSegment>();
  const lowerSegments = new Map<WaveLabel, HierarchyWaveSegment>();

  for (const label of HIERARCHY_WAVE_LABELS) {
    const h = buildHierarchySegment(higherTf, higherCandles, label);
    const l = buildHierarchySegment(lowerTf, lowerCandles, label);
    if (h) {
      higherSegments.set(label, h);
    }
    if (l) {
      lowerSegments.set(label, l);
    }
  }

  const candidates: WaveHierarchyCandidate[] = [];
  for (const hLabel of HIERARCHY_WAVE_LABELS) {
    const higher = higherSegments.get(hLabel);
    if (!higher) {
      continue;
    }
    for (const lLabel of HIERARCHY_WAVE_LABELS) {
      const lower = lowerSegments.get(lLabel);
      if (!lower) {
        continue;
      }
      candidates.push(buildCandidatePair(higher, lower));
    }
  }
  candidates.sort(compareCandidates);

  let primaryPair: WaveHierarchyCandidate | null = null;
  const hPrimary = higherTf.primaryFocus.wave;
  const lPrimary = lowerTf.primaryFocus.wave;
  if (hPrimary && lPrimary) {
    const higher = higherSegments.get(hPrimary);
    const lower = lowerSegments.get(lPrimary);
    if (higher && lower) {
      primaryPair = buildCandidatePair(higher, lower);
    }
  }

  const highlightedCandidates = candidates.filter(
    (c) =>
      c.relationship === "NESTED_CANDIDATE" ||
      c.relationship === "POSSIBLE_NESTING"
  );

  const counts = {
    totalPairs: candidates.length,
    nestedCandidate: candidates.filter(
      (c) => c.relationship === "NESTED_CANDIDATE"
    ).length,
    possibleNesting: candidates.filter(
      (c) => c.relationship === "POSSIBLE_NESTING"
    ).length,
    overlappingContext: candidates.filter(
      (c) => c.relationship === "OVERLAPPING_CONTEXT"
    ).length,
    noRelationship: candidates.filter(
      (c) => c.relationship === "NO_RELATIONSHIP"
    ).length,
    insufficientContext: candidates.filter(
      (c) => c.relationship === "INSUFFICIENT_CONTEXT"
    ).length,
  };

  return {
    schemaVersion: "1.0",
    symbol: state.symbol,
    higherTimeframe: higherTf.timeframeId,
    lowerTimeframe: lowerTf.timeframeId,
    trendContext: {
      higherTrend: state.trendAlignment.higherTrend,
      lowerTrend: state.trendAlignment.lowerTrend,
    },
    primaryPair,
    candidates,
    highlightedCandidates,
    counts,
  };
}
