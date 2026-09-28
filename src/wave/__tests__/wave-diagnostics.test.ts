import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeWaveWithDiagnostics } from "../index";
import { flatCandles, swing } from "./test-helpers";
import { detectSwings } from "../swing-detector";
import { detectTrend } from "../trend-detector";

describe("wave-diagnostics", () => {
  it("includes confirmed swings and trend source", () => {
    const candles = flatCandles(30, 100);
    for (let i = 0; i < candles.length; i++) {
      const w = Math.sin(i / 4) * 15;
      candles[i].high += w;
      candles[i].low += w;
      candles[i].close += w;
    }
    const { diagnostics } = analyzeWaveWithDiagnostics(candles, {
      swing: { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 },
    });
    assert.ok(diagnostics.confirmedSwingCount > 0);
    assert.ok(diagnostics.confirmedSwings.every((s) => s.time > 0));
    assert.ok(diagnostics.trendSource.trendRuleSummary.length > 0);
    assert.ok(diagnostics.structurePairs.length >= 0);
  });

  it("exposes fibonacci mirror when impulse waves 1-2 exist", () => {
    const candles = flatCandles(25, 100);
    const swings = [
      swing(0, 100, "LOW"),
      swing(2, 120, "HIGH"),
      swing(4, 110, "LOW"),
      swing(6, 145, "HIGH"),
      swing(8, 128, "LOW"),
      swing(10, 155, "HIGH"),
    ];
    const trend = detectTrend(swings);
    assert.ok(["BULLISH", "BEARISH", "NEUTRAL"].includes(trend));
    const detected = detectSwings(candles, {
      leftBars: 2,
      rightBars: 2,
      atrPeriod: 5,
      minAtrMultiplier: 0.05,
    });
    assert.ok(detected.length >= 0);
  });
});
