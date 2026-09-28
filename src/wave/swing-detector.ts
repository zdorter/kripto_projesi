import {
  Candle,
  DEFAULT_SWING_CONFIG,
  SwingConfig,
  SwingPoint,
  SwingType,
} from "./types";

export function mergeSwingConfig(partial?: Partial<SwingConfig>): SwingConfig {
  return { ...DEFAULT_SWING_CONFIG, ...partial };
}

function trueRange(candles: Candle[], index: number): number {
  if (index <= 0) {
    return candles[index].high - candles[index].low;
  }
  const prevClose = candles[index - 1].close;
  const c = candles[index];
  return Math.max(
    c.high - c.low,
    Math.abs(c.high - prevClose),
    Math.abs(c.low - prevClose)
  );
}

export function computeAtrSeries(
  candles: Candle[],
  period: number
): number[] {
  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0 || period < 1) {
    return atr;
  }
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = trueRange(candles, i);
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        atr[i] = sum / period;
      }
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atr;
}

function isPivotHigh(
  candles: Candle[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const h = candles[index].high;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    if (j < 0 || j >= candles.length) return false;
    if (candles[j].high >= h) return false;
  }
  return true;
}

function isPivotLow(
  candles: Candle[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const l = candles[index].low;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    if (j < 0 || j >= candles.length) return false;
    if (candles[j].low <= l) return false;
  }
  return true;
}

function pivotProminence(
  candles: Candle[],
  index: number,
  type: SwingType,
  leftBars: number,
  rightBars: number
): number {
  if (type === "HIGH") {
    let minSurrounding = Infinity;
    for (let j = index - leftBars; j <= index + rightBars; j++) {
      if (j === index) continue;
      minSurrounding = Math.min(minSurrounding, candles[j].high);
    }
    return candles[index].high - minSurrounding;
  }
  let maxSurrounding = -Infinity;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    maxSurrounding = Math.max(maxSurrounding, candles[j].low);
  }
  return maxSurrounding - candles[index].low;
}

/**
 * Maps pivot prominence vs ATR to 0–100. Does not decide whether a bar is a swing.
 */
export function computeSwingStrength(
  prominence: number,
  atrAtPivot: number,
  minAtrMultiplier: number
): number {
  if (!isFinite(prominence) || prominence <= 0) {
    return 0;
  }
  const floor = Math.max(atrAtPivot * minAtrMultiplier, 1e-12);
  const ratio = prominence / floor;
  const scaled = Math.min(1, ratio / 3) * 100;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

export function detectSwings(
  candles: Candle[],
  configPartial?: Partial<SwingConfig>
): SwingPoint[] {
  const config = mergeSwingConfig(configPartial);
  const { leftBars, rightBars, atrPeriod, minAtrMultiplier } = config;
  const swings: SwingPoint[] = [];

  if (candles.length < leftBars + rightBars + 1) {
    return swings;
  }

  const atrSeries = computeAtrSeries(candles, atrPeriod);

  for (
    let i = leftBars;
    i <= candles.length - 1 - rightBars;
    i++
  ) {
    const confirmed = i + rightBars < candles.length;
    const atrAt = atrSeries[i] > 0 ? atrSeries[i] : trueRange(candles, i);

    if (isPivotHigh(candles, i, leftBars, rightBars)) {
      const prominence = pivotProminence(
        candles,
        i,
        "HIGH",
        leftBars,
        rightBars
      );
      if (prominence < atrAt * minAtrMultiplier) {
        continue;
      }
      const strength = computeSwingStrength(
        prominence,
        atrAt,
        minAtrMultiplier
      );
      swings.push({
        index: i,
        time: candles[i].time,
        price: candles[i].high,
        type: "HIGH",
        strength,
        confirmed,
      });
    } else if (isPivotLow(candles, i, leftBars, rightBars)) {
      const prominence = pivotProminence(
        candles,
        i,
        "LOW",
        leftBars,
        rightBars
      );
      if (prominence < atrAt * minAtrMultiplier) {
        continue;
      }
      const strength = computeSwingStrength(
        prominence,
        atrAt,
        minAtrMultiplier
      );
      swings.push({
        index: i,
        time: candles[i].time,
        price: candles[i].low,
        type: "LOW",
        strength,
        confirmed,
      });
    }
  }

  return swings.sort((a, b) => a.index - b.index);
}
