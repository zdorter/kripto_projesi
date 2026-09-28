import { fibConformanceScore, nearestFibMatch } from "./fibonacci";
import { detectMarketStructures } from "./trend-detector";
import {
  Candle,
  SwingPoint,
  TrendDirection,
  WaveCandidate,
} from "./types";

export const CONFIDENCE_WEIGHTS = {
  structure: 40,
  fibonacci: 15,
  trend: 15,
  momentum: 10,
  volume: 10,
  swingQuality: 10,
} as const;

const TOTAL_WEIGHT =
  CONFIDENCE_WEIGHTS.structure +
  CONFIDENCE_WEIGHTS.fibonacci +
  CONFIDENCE_WEIGHTS.trend +
  CONFIDENCE_WEIGHTS.momentum +
  CONFIDENCE_WEIGHTS.volume +
  CONFIDENCE_WEIGHTS.swingQuality;

export interface ConfidenceInputs {
  candles: Candle[];
  swings: SwingPoint[];
  waves: WaveCandidate[];
  trend: TrendDirection;
  impulseBullish: boolean;
}

function averageSwingStrength(swings: SwingPoint[], waves: WaveCandidate[]): number {
  if (waves.length === 0) {
    return 0;
  }
  const indices = new Set<number>();
  waves.forEach((w) => {
    indices.add(w.startIndex);
    indices.add(w.endIndex);
  });
  const relevant = swings.filter((s) => indices.has(s.index));
  if (relevant.length === 0) {
    return 0;
  }
  const sum = relevant.reduce((a, s) => a + s.strength, 0);
  return sum / relevant.length;
}

function structureScore(waves: WaveCandidate[]): number {
  if (waves.length === 0) {
    return 0;
  }
  let score = 1;
  const invalidated = waves.filter((w) => w.status === "INVALIDATED").length;
  const conflicts = waves.filter((w) => w.structureConflict).length;
  score -= invalidated * 0.35;
  score -= conflicts * 0.15;
  return Math.max(0, Math.min(1, score));
}

function trendAlignmentScore(trend: TrendDirection, impulseBullish: boolean): number {
  if (trend === "NEUTRAL") {
    return 0.5;
  }
  if (impulseBullish && trend === "BULLISH") {
    return 1;
  }
  if (!impulseBullish && trend === "BEARISH") {
    return 1;
  }
  return 0.2;
}

function fibonacciScore(
  candles: Candle[],
  waves: WaveCandidate[],
  impulseBullish: boolean
): number {
  const wave2 = waves.find((w) => w.label === "2");
  const wave1 = waves.find((w) => w.label === "1");
  if (!wave1 || !wave2) {
    return 0.3;
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
  const base = fibConformanceScore(match);
  return base > 0 ? base : 0.25;
}

function momentumScore(candles: Candle[], waves: WaveCandidate[]): number {
  const w3 = waves.find((w) => w.label === "3");
  const w1 = waves.find((w) => w.label === "1");
  if (!w1 || !w3) {
    return 0.4;
  }
  const len1 = Math.abs(
    candles[w1.endIndex].close - candles[w1.startIndex].close
  );
  const len3 = Math.abs(
    candles[w3.endIndex].close - candles[w3.startIndex].close
  );
  if (len1 <= 0) {
    return 0.4;
  }
  const ratio = len3 / len1;
  if (ratio >= 1.618) {
    return 1;
  }
  if (ratio >= 1) {
    return 0.75;
  }
  if (ratio >= 0.8) {
    return 0.5;
  }
  return 0.25;
}

function volumeScore(candles: Candle[], waves: WaveCandidate[]): number {
  const w3 = waves.find((w) => w.label === "3");
  if (!w3) {
    return 0.5;
  }
  const slice = candles.slice(w3.startIndex, w3.endIndex + 1);
  if (slice.length < 2) {
    return 0.5;
  }
  const waveVol = slice.reduce((a, c) => a + c.volume, 0) / slice.length;
  const priorStart = Math.max(0, w3.startIndex - slice.length);
  const prior = candles.slice(priorStart, w3.startIndex);
  if (prior.length === 0) {
    return 0.5;
  }
  const priorVol = prior.reduce((a, c) => a + c.volume, 0) / prior.length;
  if (priorVol <= 0) {
    return 0.5;
  }
  const ratio = waveVol / priorVol;
  if (ratio >= 1.2) {
    return 1;
  }
  if (ratio >= 0.9) {
    return 0.6;
  }
  return 0.35;
}

/**
 * Rule-conformance score (0–100), not a trade or directional probability.
 */
export function computeConfidence(inputs: ConfidenceInputs): number {
  const {
    candles,
    swings,
    waves,
    trend,
    impulseBullish,
  } = inputs;

  const structure = structureScore(waves);
  const fibonacci = fibonacciScore(candles, waves, impulseBullish);
  const trendScore = trendAlignmentScore(trend, impulseBullish);
  const momentum = momentumScore(candles, waves);
  const volume = volumeScore(candles, waves);
  const swingQuality = averageSwingStrength(swings, waves) / 100;

  const weighted =
    structure * CONFIDENCE_WEIGHTS.structure +
    fibonacci * CONFIDENCE_WEIGHTS.fibonacci +
    trendScore * CONFIDENCE_WEIGHTS.trend +
    momentum * CONFIDENCE_WEIGHTS.momentum +
    volume * CONFIDENCE_WEIGHTS.volume +
    swingQuality * CONFIDENCE_WEIGHTS.swingQuality;

  const score = (weighted / TOTAL_WEIGHT) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function applyPerWaveConfidence(
  waves: WaveCandidate[],
  overall: number
): WaveCandidate[] {
  return waves.map((w) => {
    let factor = 1;
    if (w.status === "INVALIDATED") {
      factor = 0.35;
    } else if (w.status === "POTENTIAL") {
      factor = 0.7;
    }
    if (w.structureConflict) {
      factor *= 0.85;
    }
    const confidence = Math.round(
      Math.max(0, Math.min(100, overall * factor))
    );
    return { ...w, confidence };
  });
}

export function structureQualityFromSwings(swings: SwingPoint[]): number {
  const structures = detectMarketStructures(swings);
  if (structures.length === 0) {
    return 0.5;
  }
  const bullish = structures.filter((s) => s === "HH" || s === "HL").length;
  const bearish = structures.filter((s) => s === "LH" || s === "LL").length;
  const dominant = Math.max(bullish, bearish);
  return dominant / structures.length;
}
