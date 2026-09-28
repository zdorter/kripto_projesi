import type { Candle, WaveEngineOptions } from "../wave/types";

const BASE_TIME_MS = 1_700_000_000_000;
const BAR_MS = 60_000;

/**
 * Same pivot prices as wave-detector.test.ts:
 * bullishImpulseSwings(110, 128) plus A-B-C extension (140 / 148 / 132).
 * Indices are shifted +2 so each pivot satisfies leftBars/rightBars = 2.
 */
const DEMO_PIVOTS: ReadonlyArray<{
  index: number;
  type: "HIGH" | "LOW";
  price: number;
}> = [
  { index: 2, type: "LOW", price: 100 },
  { index: 4, type: "HIGH", price: 120 },
  { index: 6, type: "LOW", price: 110 },
  { index: 8, type: "HIGH", price: 145 },
  { index: 10, type: "LOW", price: 128 },
  { index: 12, type: "HIGH", price: 155 },
  { index: 14, type: "LOW", price: 140 },
  { index: 16, type: "HIGH", price: 148 },
  { index: 18, type: "LOW", price: 132 },
];

const BAR_COUNT = 24;
const PIVOT_WINDOW_MARGIN = 4;

function buildDemoOhlcv(): Candle[] {
  const closes = new Array<number>(BAR_COUNT).fill(115);

  for (let k = 0; k < DEMO_PIVOTS.length - 1; k++) {
    const a = DEMO_PIVOTS[k];
    const b = DEMO_PIVOTS[k + 1];
    const span = b.index - a.index;
    for (let i = a.index; i <= b.index; i++) {
      const t = span === 0 ? 0 : (i - a.index) / span;
      closes[i] = a.price + (b.price - a.price) * t;
    }
  }

  const candles: Candle[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const close = closes[i];
    candles.push({
      time: BASE_TIME_MS + i * BAR_MS,
      open: i === 0 ? close : candles[i - 1].close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + (i % 10) * 50,
    });
  }

  for (const pivot of DEMO_PIVOTS) {
    const bar = candles[pivot.index];
    if (pivot.type === "HIGH") {
      bar.high = pivot.price;
      bar.close = pivot.price - 0.5;
      bar.low = Math.min(bar.low, pivot.price - 3);
    } else {
      bar.low = pivot.price;
      bar.close = pivot.price + 0.5;
      bar.high = Math.max(bar.high, pivot.price + 3);
    }

    for (let j = pivot.index - 2; j <= pivot.index + 2; j++) {
      if (j < 0 || j >= BAR_COUNT || j === pivot.index) {
        continue;
      }
      if (pivot.type === "HIGH") {
        candles[j].high = Math.min(candles[j].high, pivot.price - PIVOT_WINDOW_MARGIN);
      } else {
        candles[j].low = Math.max(candles[j].low, pivot.price + PIVOT_WINDOW_MARGIN);
      }
    }
  }

  return candles;
}

export const DEMO_OHLCV: Candle[] = buildDemoOhlcv();

/** Matches relaxed settings used in wave engine unit tests. */
export const DEMO_WAVE_ENGINE_OPTIONS: WaveEngineOptions = {
  swing: {
    leftBars: 2,
    rightBars: 2,
    atrPeriod: 5,
    minAtrMultiplier: 0.05,
  },
};
