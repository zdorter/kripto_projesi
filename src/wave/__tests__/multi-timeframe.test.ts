import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeMultiTimeframe,
  buildTimeframeBundle,
  classifyMultiTimeframeRelationship,
  compareTrends,
} from "../multi-timeframe";
import { flatCandles } from "./test-helpers";
import type { FocusContextView } from "../multi-timeframe";

function primaryFocus(
  wave: FocusContextView["wave"] | null,
  structure: "IMPULSE" | "CORRECTIVE"
): FocusContextView {
  return {
    structure,
    wave,
    status: "POTENTIAL",
    confidence: 50,
    startIndex: 10,
    endIndex: 20,
    startPrice: 100,
    endPrice: 110,
    startTime: 1,
    endTime: 2,
    priceRangeLow: 99,
    priceRangeHigh: 111,
  };
}

describe("multi-timeframe", () => {
  it("analyzes higher and lower candle series independently", () => {
    const higher = flatCandles(80, 100);
    const lower = flatCandles(120, 100);
    for (let i = 0; i < higher.length; i++) {
      const w = Math.sin(i / 5) * 10;
      higher[i].high += w;
      higher[i].low += w;
    }
    for (let i = 0; i < lower.length; i++) {
      const w = Math.cos(i / 3) * 5;
      lower[i].high += w;
      lower[i].low += w;
    }

    const state = analyzeMultiTimeframe(higher, lower);
    assert.equal(state.higherTimeframe.candleCount, 80);
    assert.equal(state.lowerTimeframe.candleCount, 120);
    assert.equal(state.higherTimeframe.timeframeId, "1H");
    assert.equal(state.lowerTimeframe.timeframeId, "15M");
    assert.ok(state.higherTimeframe.diagnostics.swingConfig);
    assert.ok(state.lowerTimeframe.diagnostics.swingConfig);
  });

  it("assigns higher and lower timeframe ids from config", () => {
    const candles = flatCandles(30, 50);
    const state = analyzeMultiTimeframe(candles, candles, {
      higherTimeframeId: "4H",
      lowerTimeframeId: "1H",
    });
    assert.equal(state.higherTimeframe.timeframeId, "4H");
    assert.equal(state.lowerTimeframe.timeframeId, "1H");
  });

  it("compareTrends is deterministic", () => {
    assert.equal(compareTrends("BULLISH", "BULLISH"), "SAME");
    assert.equal(compareTrends("BEARISH", "BULLISH"), "DIFFERENT");
    assert.equal(compareTrends("NEUTRAL", "BULLISH"), "PARTIAL_NEUTRAL");
  });

  it("classifies ALIGNED when trends and structure kinds match", () => {
    const rel = classifyMultiTimeframeRelationship({
      higherCandleCount: 100,
      lowerCandleCount: 100,
      higherTrend: "BULLISH",
      lowerTrend: "BULLISH",
      higherPrimary: primaryFocus("3", "IMPULSE"),
      lowerPrimary: primaryFocus("2", "IMPULSE"),
    });
    assert.equal(rel.kind, "ALIGNED");
  });

  it("classifies DIVERGENT when non-neutral trends differ", () => {
    const rel = classifyMultiTimeframeRelationship({
      higherCandleCount: 100,
      lowerCandleCount: 100,
      higherTrend: "BULLISH",
      lowerTrend: "BEARISH",
      higherPrimary: primaryFocus("3", "IMPULSE"),
      lowerPrimary: primaryFocus("C", "CORRECTIVE"),
    });
    assert.equal(rel.kind, "DIVERGENT");
  });

  it("classifies NESTED_POSSIBLE when trends agree but structure kinds differ", () => {
    const rel = classifyMultiTimeframeRelationship({
      higherCandleCount: 100,
      lowerCandleCount: 100,
      higherTrend: "BULLISH",
      lowerTrend: "BULLISH",
      higherPrimary: primaryFocus("3", "IMPULSE"),
      lowerPrimary: primaryFocus("C", "CORRECTIVE"),
    });
    assert.equal(rel.kind, "NESTED_POSSIBLE");
  });

  it("keeps primary focus contexts separate per bundle", () => {
    const higher = flatCandles(50, 200);
    const lower = flatCandles(50, 50);
    for (let i = 0; i < higher.length; i++) {
      higher[i].close += i * 0.5;
    }
    for (let i = 0; i < lower.length; i++) {
      lower[i].close -= i * 0.2;
    }
    const state = analyzeMultiTimeframe(higher, lower);
    assert.notEqual(
      state.higherTimeframe.primaryFocus,
      state.lowerTimeframe.primaryFocus
    );
    assert.notEqual(
      state.higherTimeframe.presentation,
      state.lowerTimeframe.presentation
    );
  });

  it("handles insufficient candle data", () => {
    const rel = classifyMultiTimeframeRelationship({
      higherCandleCount: 0,
      lowerCandleCount: 10,
      higherTrend: "NEUTRAL",
      lowerTrend: "NEUTRAL",
      higherPrimary: primaryFocus(null, "IMPULSE"),
      lowerPrimary: primaryFocus("1", "IMPULSE"),
    });
    assert.equal(rel.kind, "INSUFFICIENT_CONTEXT");
  });

  it("buildTimeframeBundle exposes diagnostics separate from other timeframe", () => {
    const higher = flatCandles(40, 10);
    const lower = flatCandles(60, 10);
    for (let i = 0; i < higher.length; i++) {
      higher[i].high += Math.sin(i / 3) * 5;
      higher[i].low += Math.sin(i / 3) * 5;
    }
    for (let i = 0; i < lower.length; i++) {
      lower[i].high += Math.cos(i / 2) * 8;
      lower[i].low += Math.cos(i / 2) * 8;
    }
    const a = buildTimeframeBundle(higher, "1H");
    const b = buildTimeframeBundle(lower, "15M");
    assert.notEqual(a.candleCount, b.candleCount);
    assert.notEqual(a.timeWindow.endTime, b.timeWindow.startTime);
  });
});
