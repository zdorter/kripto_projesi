import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeSwingStrength,
  detectSwings,
} from "../swing-detector";
import { candle, flatCandles } from "./test-helpers";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.1 };

describe("swing-detector", () => {
  it("detects Swing High", () => {
    const prices = [10, 11, 12, 15, 12, 11, 10, 9, 10, 11];
    const candles = prices.map((p, i) =>
      candle(i, p, p + 0.2, p - 0.2, p)
    );
    const swings = detectSwings(candles, SMALL_SWING);
    const highs = swings.filter((s) => s.type === "HIGH");
    assert.ok(highs.some((s) => s.index === 3));
  });

  it("detects Swing Low", () => {
    const prices = [15, 14, 13, 10, 13, 14, 15, 16, 15, 14];
    const candles = prices.map((p, i) =>
      candle(i, p, p + 0.2, p - 0.2, p)
    );
    const swings = detectSwings(candles, SMALL_SWING);
    const lows = swings.filter((s) => s.type === "LOW");
    assert.ok(lows.some((s) => s.index === 3));
  });

  it("marks swing confirmed only after rightBars", () => {
    const prices = [10, 11, 12, 15, 12, 11, 10];
    const candles = prices.map((p, i) =>
      candle(i, p, p + 0.2, p - 0.2, p)
    );
    const partial = detectSwings(candles.slice(0, 5), SMALL_SWING);
    const highAt3 = partial.find((s) => s.index === 3 && s.type === "HIGH");
    if (highAt3) {
      assert.equal(highAt3.confirmed, false);
    }
    const full = detectSwings(candles, SMALL_SWING);
    const confirmedHigh = full.find((s) => s.index === 3 && s.type === "HIGH");
    assert.ok(confirmedHigh);
    assert.equal(confirmedHigh!.confirmed, true);
  });

  it("repainting prevention: confirmed swings stable when extending data", () => {
    const base = flatCandles(20, 100);
    for (let i = 5; i <= 7; i++) {
      base[i].high = 120;
      base[i].close = 118;
    }
    const short = detectSwings(base.slice(0, 12), SMALL_SWING);
    const long = detectSwings(base, SMALL_SWING);
    const confirmedShort = short.filter((s) => s.confirmed);
    for (const s of confirmedShort) {
      const match = long.find(
        (l) => l.index === s.index && l.type === s.type && l.confirmed
      );
      assert.ok(match, `swing at ${s.index} should remain confirmed`);
      assert.equal(match!.price, s.price);
    }
  });

  it("computeSwingStrength is separate from detection", () => {
    const strength = computeSwingStrength(5, 2, 0.5);
    assert.ok(strength > 0 && strength <= 100);
    const zero = computeSwingStrength(0, 2, 0.5);
    assert.equal(zero, 0);
  });
});
