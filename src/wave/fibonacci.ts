export const FIB_RETRACEMENT_LEVELS = [0.382, 0.5, 0.618, 0.786] as const;
export const FIB_EXTENSION_LEVELS = [1.0, 1.272, 1.618] as const;

export type FibRetracementLevel = (typeof FIB_RETRACEMENT_LEVELS)[number];
export type FibExtensionLevel = (typeof FIB_EXTENSION_LEVELS)[number];

export function fibRetracementPrice(
  start: number,
  end: number,
  level: FibRetracementLevel
): number {
  const range = end - start;
  return end - range * level;
}

export function fibExtensionPrice(
  start: number,
  end: number,
  level: FibExtensionLevel
): number {
  const range = end - start;
  return end + range * (level - 1);
}

export interface FibMatchResult {
  level: number;
  kind: "retracement" | "extension";
  distanceRatio: number;
}

const RETRACE_TOLERANCE = 0.08;
const EXTENSION_TOLERANCE = 0.1;

/**
 * How closely `actual` sits near a fib level between swing start/end (for confidence only).
 */
export function nearestFibMatch(
  start: number,
  end: number,
  actual: number,
  _bullishMove: boolean
): FibMatchResult | null {
  const absRange = Math.abs(end - start);
  if (absRange <= 0) {
    return null;
  }

  let best: FibMatchResult | null = null;

  for (const level of FIB_RETRACEMENT_LEVELS) {
    const ideal = fibRetracementPrice(start, end, level);
    const dist = Math.abs(actual - ideal) / absRange;
    if (dist <= RETRACE_TOLERANCE) {
      if (!best || dist < best.distanceRatio) {
        best = { level, kind: "retracement", distanceRatio: dist };
      }
    }
  }

  for (const level of FIB_EXTENSION_LEVELS) {
    const ideal = fibExtensionPrice(start, end, level);
    const dist = Math.abs(actual - ideal) / absRange;
    if (dist <= EXTENSION_TOLERANCE) {
      if (!best || dist < best.distanceRatio) {
        best = { level, kind: "extension", distanceRatio: dist };
      }
    }
  }

  return best;
}

export function fibConformanceScore(match: FibMatchResult | null): number {
  if (!match) {
    return 0;
  }
  const tolerance =
    match.kind === "retracement" ? RETRACE_TOLERANCE : EXTENSION_TOLERANCE;
  const normalized = 1 - match.distanceRatio / tolerance;
  return Math.max(0, Math.min(1, normalized));
}
