import {
  Candle,
  SwingPoint,
  TrendDirection,
  WaveCandidate,
  WaveLabel,
  WaveStatus,
} from "./types";

const IMPULSE_LABELS: WaveLabel[] = ["1", "2", "3", "4", "5"];
const CORRECTIVE_LABELS: WaveLabel[] = ["A", "B", "C"];

const WAVE3_MIN_EXPANSION_RATIO = 0.8;

/**
 * Wave 2 structural invalidation boundary (impulse count).
 * Same price threshold used when marking Wave 2 INVALIDATED.
 */
export function wave2StructuralInvalidationPrice(wave1Origin: number): number {
  return wave1Origin;
}

function applyWave2InvalidationRule(
  waves: WaveCandidate[],
  wave1Origin: number,
  wave2End: number,
  bullish: boolean
): void {
  const w2 = waves.find((w) => w.label === "2");
  if (!w2) {
    return;
  }
  const boundary = wave2StructuralInvalidationPrice(wave1Origin);
  w2.invalidationPrice = boundary;
  const breached = bullish ? wave2End < boundary : wave2End > boundary;
  if (breached) {
    w2.status = "INVALIDATED";
  }
}

export interface WaveDetectionResult {
  impulse: WaveCandidate[];
  corrective: WaveCandidate[];
  alternatives: WaveCandidate[][];
  impulseBullish: boolean;
}

function mergeSameTypeSwings(swings: SwingPoint[]): SwingPoint[] {
  if (swings.length === 0) {
    return [];
  }
  const out: SwingPoint[] = [swings[0]];
  for (let i = 1; i < swings.length; i++) {
    const prev = out[out.length - 1];
    const cur = swings[i];
    if (prev.type !== cur.type) {
      out.push(cur);
      continue;
    }
    if (cur.type === "HIGH") {
      if (cur.price >= prev.price) {
        out[out.length - 1] = cur;
      }
    } else if (cur.price <= prev.price) {
      out[out.length - 1] = cur;
    }
  }
  return out;
}

function swingPriceAt(swing: SwingPoint): number {
  return swing.price;
}

function segmentStatus(
  start: SwingPoint,
  end: SwingPoint
): WaveStatus {
  if (start.confirmed && end.confirmed) {
    return "CONFIRMED";
  }
  return "POTENTIAL";
}

function buildImpulseFromPivots(
  pivots: SwingPoint[],
  bullish: boolean
): WaveCandidate[] {
  if (pivots.length < 6) {
    return [];
  }

  const [p0, p1, p2, p3, p4, p5] = pivots.slice(-6);
  const waves: WaveCandidate[] = [];

  const pushWave = (
    label: WaveLabel,
    start: SwingPoint,
    end: SwingPoint,
    extra?: Partial<WaveCandidate>
  ) => {
    waves.push({
      label,
      startIndex: start.index,
      endIndex: end.index,
      confidence: 0,
      status: segmentStatus(start, end),
      ...extra,
    });
  };

  pushWave("1", p0, p1);
  pushWave("2", p1, p2);
  pushWave("3", p2, p3);
  pushWave("4", p3, p4);
  pushWave("5", p4, p5);

  const w1Start = swingPriceAt(p0);
  const w1End = swingPriceAt(p1);
  const w2End = swingPriceAt(p2);

  applyWave2InvalidationRule(waves, w1Start, w2End, bullish);

  if (bullish) {
    const wave1Len = w1End - w1Start;
    const wave3Len = swingPriceAt(p3) - w2End;
    const w3 = waves.find((w) => w.label === "3");
    if (w3 && wave1Len > 0 && wave3Len < wave1Len * WAVE3_MIN_EXPANSION_RATIO) {
      w3.status = "POTENTIAL";
    }
    const wave1High = w1End;
    const w4End = swingPriceAt(p4);
    const w4 = waves.find((w) => w.label === "4");
    if (w4 && w4End < wave1High) {
      w4.structureConflict = true;
    }
    const w5 = waves.find((w) => w.label === "5");
    if (w5 && swingPriceAt(p5) <= swingPriceAt(p3)) {
      w5.status = "POTENTIAL";
    }
  } else {
    const wave1Len = w1Start - w1End;
    const wave3Len = w2End - swingPriceAt(p3);
    const w3 = waves.find((w) => w.label === "3");
    if (w3 && wave1Len > 0 && wave3Len < wave1Len * WAVE3_MIN_EXPANSION_RATIO) {
      w3.status = "POTENTIAL";
    }
    const wave1Low = w1End;
    const w4End = swingPriceAt(p4);
    const w4 = waves.find((w) => w.label === "4");
    if (w4 && w4End > wave1Low) {
      w4.structureConflict = true;
    }
    const w5 = waves.find((w) => w.label === "5");
    if (w5 && swingPriceAt(p5) >= swingPriceAt(p3)) {
      w5.status = "POTENTIAL";
    }
  }

  return waves;
}

function buildCorrectiveFromPivots(
  pivots: SwingPoint[],
  bullishImpulse: boolean
): WaveCandidate[] {
  if (pivots.length < 9) {
    return [];
  }
  const slice = pivots.slice(-9);
  const [p5, p6, p7, p8] = [slice[5], slice[6], slice[7], slice[8]];
  const expectedTypes: Array<"HIGH" | "LOW"> = bullishImpulse
    ? ["HIGH", "LOW", "HIGH", "LOW"]
    : ["LOW", "HIGH", "LOW", "HIGH"];
  const seq = [p5, p6, p7, p8];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].type !== expectedTypes[i]) {
      return [];
    }
  }

  const waves: WaveCandidate[] = [];
  waves.push({
    label: "A",
    startIndex: p5.index,
    endIndex: p6.index,
    confidence: 0,
    status: segmentStatus(p5, p6),
  });
  waves.push({
    label: "B",
    startIndex: p6.index,
    endIndex: p7.index,
    confidence: 0,
    status: segmentStatus(p6, p7),
  });
  waves.push({
    label: "C",
    startIndex: p7.index,
    endIndex: p8.index,
    confidence: 0,
    status: segmentStatus(p7, p8),
  });
  return waves;
}

function selectPivotChain(
  swings: SwingPoint[],
  bullish: boolean
): SwingPoint[] {
  const confirmed = swings.filter((s) => s.confirmed);
  const merged = mergeSameTypeSwings(confirmed);
  const wantStart: SwingPoint["type"] = bullish ? "LOW" : "HIGH";
  let startIdx = merged.findIndex((s) => s.type === wantStart);
  if (startIdx < 0) {
    return [];
  }
  const chain: SwingPoint[] = [];
  let expect = wantStart;
  for (let i = startIdx; i < merged.length; i++) {
    if (merged[i].type === expect) {
      chain.push(merged[i]);
      expect = expect === "LOW" ? "HIGH" : "LOW";
    }
  }
  return chain;
}

function tryImpulse(
  swings: SwingPoint[],
  bullish: boolean
): WaveCandidate[] {
  const chain = selectPivotChain(swings, bullish);
  return buildImpulseFromPivots(chain, bullish);
}

function tryCorrective(
  swings: SwingPoint[],
  impulseBullish: boolean
): WaveCandidate[] {
  const chain = selectPivotChain(swings, impulseBullish);
  return buildCorrectiveFromPivots(chain, impulseBullish);
}

function scoreImpulse(waves: WaveCandidate[]): number {
  if (waves.length < 5) {
    return -1;
  }
  let score = 0;
  waves.forEach((w) => {
    if (w.status === "CONFIRMED") score += 2;
    if (w.status === "POTENTIAL") score += 1;
    if (w.status === "INVALIDATED") score -= 4;
    if (w.structureConflict) score -= 1;
  });
  return score;
}

export function detectWaves(
  _candles: Candle[],
  swings: SwingPoint[],
  trend: TrendDirection
): WaveDetectionResult {
  const bullishImpulse = tryImpulse(swings, true);
  const bearishImpulse = tryImpulse(swings, false);

  let impulseBullish = true;
  let impulse: WaveCandidate[] = bullishImpulse;

  const bullScore = scoreImpulse(bullishImpulse);
  const bearScore = scoreImpulse(bearishImpulse);

  if (bearScore > bullScore) {
    impulse = bearishImpulse;
    impulseBullish = false;
  } else if (bullScore === bearScore && trend === "BEARISH") {
    impulse = bearishImpulse;
    impulseBullish = false;
  }

  const alternatives: WaveCandidate[][] = [];
  if (bullishImpulse.length >= 5 && bearishImpulse.length >= 5) {
    if (impulseBullish) {
      alternatives.push(bearishImpulse);
    } else {
      alternatives.push(bullishImpulse);
    }
  }

  const corrective = tryCorrective(swings, impulseBullish);

  return {
    impulse,
    corrective,
    alternatives,
    impulseBullish,
  };
}

export function currentWaveLabel(
  waves: WaveCandidate[]
): WaveLabel | undefined {
  const ordered = [...IMPULSE_LABELS, ...CORRECTIVE_LABELS];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const label = ordered[i];
    const w = waves.find((x) => x.label === label);
    if (w && w.status !== "INVALIDATED") {
      return label;
    }
  }
  return waves.length > 0 ? waves[waves.length - 1].label : undefined;
}

export function primaryInvalidationPrice(
  waves: WaveCandidate[]
): number | undefined {
  const w2 = waves.find((w) => w.label === "2");
  if (w2?.invalidationPrice !== undefined) {
    return w2.invalidationPrice;
  }
  const withPrice = waves.find((w) => w.invalidationPrice !== undefined);
  return withPrice?.invalidationPrice;
}
