import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_WEIGHTS,
  computeConfidence,
} from "../confidence";
import { analyzeWave } from "../index";
import { flatCandles, swing } from "./test-helpers";

describe("confidence", () => {
  it("weights sum to 100", () => {
    const sum =
      CONFIDENCE_WEIGHTS.structure +
      CONFIDENCE_WEIGHTS.fibonacci +
      CONFIDENCE_WEIGHTS.trend +
      CONFIDENCE_WEIGHTS.momentum +
      CONFIDENCE_WEIGHTS.volume +
      CONFIDENCE_WEIGHTS.swingQuality;
    assert.equal(sum, 100);
  });

  it("computeConfidence returns 0–100", () => {
    const candles = flatCandles(20, 50);
    const swings = [
      swing(0, 100, "LOW"),
      swing(2, 120, "HIGH"),
      swing(4, 110, "LOW"),
      swing(6, 140, "HIGH"),
      swing(8, 125, "LOW"),
      swing(10, 150, "HIGH"),
    ];
    const waves = [
      {
        label: "1" as const,
        startIndex: 0,
        endIndex: 2,
        confidence: 0,
        status: "CONFIRMED" as const,
      },
      {
        label: "2" as const,
        startIndex: 2,
        endIndex: 4,
        confidence: 0,
        status: "CONFIRMED" as const,
      },
    ];
    const score = computeConfidence({
      candles,
      swings,
      waves,
      trend: "BULLISH",
      impulseBullish: true,
    });
    assert.ok(score >= 0 && score <= 100);
  });

  it("lowers score when waves invalidated", () => {
    const candles = flatCandles(20, 50);
    const swings = [
      swing(0, 100, "LOW"),
      swing(2, 120, "HIGH"),
      swing(4, 90, "LOW"),
      swing(6, 140, "HIGH"),
    ];
    const validWaves = [
      {
        label: "1" as const,
        startIndex: 0,
        endIndex: 2,
        confidence: 0,
        status: "CONFIRMED" as const,
      },
      {
        label: "2" as const,
        startIndex: 2,
        endIndex: 4,
        confidence: 0,
        status: "CONFIRMED" as const,
      },
    ];
    const invalidWaves = [
      validWaves[0],
      { ...validWaves[1], status: "INVALIDATED" as const },
    ];
    const validScore = computeConfidence({
      candles,
      swings,
      waves: validWaves,
      trend: "BULLISH",
      impulseBullish: true,
    });
    const invalidScore = computeConfidence({
      candles,
      swings,
      waves: invalidWaves,
      trend: "BULLISH",
      impulseBullish: true,
    });
    assert.ok(invalidScore < validScore);
  });

  it("analyzeWave exposes overall confidence", () => {
    const candles = flatCandles(30, 100);
    for (let i = 0; i < candles.length; i++) {
      const wave = Math.sin(i / 3) * 10;
      candles[i].high += wave;
      candles[i].low += wave;
      candles[i].close += wave;
    }
    const analysis = analyzeWave(candles, {
      swing: { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 },
    });
    assert.ok(analysis.confidence >= 0 && analysis.confidence <= 100);
  });
});
