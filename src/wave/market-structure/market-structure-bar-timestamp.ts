import type { Candle } from "../types";

const ONE_MINUTE_MS = 60_000;

/** Supported wave timeframe ids for MSL-7 bar-close semantics (Binance-aligned). */
const TIMEFRAME_DURATION_MS: Readonly<Record<string, number>> = {
  "1M": ONE_MINUTE_MS,
  "3M": 3 * ONE_MINUTE_MS,
  "5M": 5 * ONE_MINUTE_MS,
  "15M": 15 * ONE_MINUTE_MS,
  "30M": 30 * ONE_MINUTE_MS,
  "1H": 60 * ONE_MINUTE_MS,
  "2H": 2 * 60 * ONE_MINUTE_MS,
  "4H": 4 * 60 * ONE_MINUTE_MS,
  "6H": 6 * 60 * ONE_MINUTE_MS,
  "8H": 8 * 60 * ONE_MINUTE_MS,
  "12H": 12 * 60 * ONE_MINUTE_MS,
  "1D": 24 * 60 * ONE_MINUTE_MS,
  "3D": 3 * 24 * 60 * ONE_MINUTE_MS,
  "1W": 7 * 24 * 60 * ONE_MINUTE_MS,
};

export function normalizeTimeframeId(timeframeId: string): string {
  return String(timeframeId ?? "").trim().toUpperCase();
}

export function getTimeframeDurationMs(timeframeId: string): number | null {
  const key = normalizeTimeframeId(timeframeId);
  const duration = TIMEFRAME_DURATION_MS[key];
  return duration ?? null;
}

export function barOpenTimestamp(candle: Candle): number {
  return candle.time;
}

export function barCloseTimestamp(candle: Candle, timeframeId: string): number | null {
  const durationMs = getTimeframeDurationMs(timeframeId);
  if (durationMs === null) {
    return null;
  }
  return candle.time + durationMs - 1;
}

export function knownAtTimestampFromBarIndex(
  candles: readonly Candle[],
  barIndex: number,
  timeframeId: string
): number | null {
  if (
    !Number.isInteger(barIndex) ||
    barIndex < 0 ||
    barIndex >= candles.length
  ) {
    return null;
  }
  return barCloseTimestamp(candles[barIndex], timeframeId);
}

export function isKnownAtOrBefore(
  entityKnownAtTimestamp: number,
  ltfEvaluationTimestamp: number
): boolean {
  return entityKnownAtTimestamp <= ltfEvaluationTimestamp;
}
