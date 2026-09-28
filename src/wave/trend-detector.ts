import { MarketStructure, SwingPoint, TrendDirection } from "./types";

export function classifyHighStructure(
  previous: SwingPoint,
  current: SwingPoint
): MarketStructure {
  return current.price > previous.price ? "HH" : "LH";
}

export function classifyLowStructure(
  previous: SwingPoint,
  current: SwingPoint
): MarketStructure {
  return current.price > previous.price ? "HL" : "LL";
}

export function detectMarketStructures(swings: SwingPoint[]): MarketStructure[] {
  const structures: MarketStructure[] = [];
  const highs = swings.filter((s) => s.type === "HIGH" && s.confirmed);
  const lows = swings.filter((s) => s.type === "LOW" && s.confirmed);

  for (let i = 1; i < highs.length; i++) {
    structures.push(classifyHighStructure(highs[i - 1], highs[i]));
  }
  for (let i = 1; i < lows.length; i++) {
    structures.push(classifyLowStructure(lows[i - 1], lows[i]));
  }
  return structures;
}

/**
 * Deterministic trend from the two most recent confirmed swing highs and lows.
 */
export function detectTrend(swings: SwingPoint[]): TrendDirection {
  const highs = swings.filter((s) => s.type === "HIGH" && s.confirmed);
  const lows = swings.filter((s) => s.type === "LOW" && s.confirmed);

  if (highs.length < 2 || lows.length < 2) {
    return "NEUTRAL";
  }

  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  const highStructure = classifyHighStructure(prevHigh, lastHigh);
  const lowStructure = classifyLowStructure(prevLow, lastLow);

  const confirmed = swings.filter((s) => s.confirmed);
  const lastSwing = confirmed[confirmed.length - 1];

  if (
    highStructure === "HH" &&
    lowStructure === "HL" &&
    lastSwing.type === "HIGH"
  ) {
    return "BULLISH";
  }
  if (
    highStructure === "LH" &&
    lowStructure === "LL" &&
    lastSwing.type === "LOW"
  ) {
    return "BEARISH";
  }
  return "NEUTRAL";
}
