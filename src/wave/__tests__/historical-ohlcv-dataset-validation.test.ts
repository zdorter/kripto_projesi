import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import {
  assertHistoricalOhlcvDatasetValid,
  HistoricalOhlcvDatasetValidationError,
  validateHistoricalOhlcvDataset,
} from "../historical-ohlcv-dataset-validation";

function candle(time: number, o = 1, h = 2, l = 0.5, c = 1.5, v = 10): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v };
}

describe("historical-ohlcv-dataset-validation", () => {
  it("accepts ordered valid OHLCV", () => {
    const result = validateHistoricalOhlcvDataset({
      candles: [candle(1000), candle(2000)],
    });
    assert.equal(result.ok, true);
  });

  it("rejects duplicate timestamps", () => {
    const result = validateHistoricalOhlcvDataset({
      candles: [candle(1000), candle(1000)],
    });
    assert.equal(result.ok, false);
    assert.equal(result.issues[0]?.code, "DUPLICATE_TIMESTAMP");
  });

  it("rejects invalid high/low relation", () => {
    const bad = candle(1000, 10, 9, 8, 10, 1);
    const result = validateHistoricalOhlcvDataset({ candles: [bad] });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((i) => i.code === "INVALID_OHLC_RELATION")
    );
  });

  it("assert throws deterministic error", () => {
    assert.throws(
      () => assertHistoricalOhlcvDatasetValid({ candles: [] }),
      HistoricalOhlcvDatasetValidationError
    );
  });

  it("enforces uniform bar duration when configured", () => {
    const result = validateHistoricalOhlcvDataset({
      candles: [candle(0), candle(3_600_000)],
      expectedBarDurationMs: 3_600_000,
    });
    assert.equal(result.ok, true);
    const gap = validateHistoricalOhlcvDataset({
      candles: [candle(0), candle(7_200_000)],
      expectedBarDurationMs: 3_600_000,
    });
    assert.equal(gap.ok, false);
    assert.equal(gap.issues[0]?.code, "TIMEFRAME_GAP");
  });
});
