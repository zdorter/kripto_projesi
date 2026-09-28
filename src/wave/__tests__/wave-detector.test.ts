import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectWaves } from "../wave-detector";
import { candle, flatCandles, swing } from "./test-helpers";

function bullishImpulseSwings(wave2Price: number, wave4Price: number): ReturnType<typeof swing>[] {
  return [
    swing(0, 100, "LOW"),
    swing(2, 120, "HIGH"),
    swing(4, wave2Price, "LOW"),
    swing(6, 145, "HIGH"),
    swing(8, wave4Price, "LOW"),
    swing(10, 155, "HIGH"),
  ];
}

function bearishImpulseSwings(): ReturnType<typeof swing>[] {
  return [
    swing(0, 150, "HIGH"),
    swing(2, 120, "LOW"),
    swing(4, 135, "HIGH"),
    swing(6, 100, "LOW"),
    swing(8, 115, "HIGH"),
    swing(10, 90, "LOW"),
  ];
}

describe("wave-detector", () => {
  const candles = flatCandles(25, 100);

  it("builds bullish impulse candidate", () => {
    const swings = bullishImpulseSwings(110, 128);
    const result = detectWaves(candles, swings, "BULLISH");
    assert.equal(result.impulse.length, 5);
    assert.equal(result.impulseBullish, true);
    assert.deepEqual(
      result.impulse.map((w) => w.label),
      ["1", "2", "3", "4", "5"]
    );
  });

  it("builds bearish impulse candidate", () => {
    const swings = bearishImpulseSwings();
    const result = detectWaves(candles, swings, "BEARISH");
    assert.equal(result.impulse.length, 5);
    assert.equal(result.impulseBullish, false);
  });

  it("marks valid Wave 2 as confirmed segment", () => {
    const swings = bullishImpulseSwings(110, 128);
    const result = detectWaves(candles, swings, "BULLISH");
    const w2 = result.impulse.find((w) => w.label === "2");
    assert.ok(w2);
    assert.notEqual(w2!.status, "INVALIDATED");
  });

  it("invalidates Wave 2 when retracement exceeds wave 1 start", () => {
    const swings = bullishImpulseSwings(95, 128);
    const result = detectWaves(candles, swings, "BULLISH");
    const w2 = result.impulse.find((w) => w.label === "2");
    assert.ok(w2);
    assert.equal(w2!.status, "INVALIDATED");
    assert.equal(w2!.invalidationPrice, 100);
  });

  it("detects Wave 4 segment", () => {
    const swings = bullishImpulseSwings(110, 128);
    const result = detectWaves(candles, swings, "BULLISH");
    const w4 = result.impulse.find((w) => w.label === "4");
    assert.ok(w4);
    assert.equal(w4!.startIndex, 6);
    assert.equal(w4!.endIndex, 8);
  });

  it("flags Wave 4 structure conflict when overlapping wave 1 zone", () => {
    const swings = bullishImpulseSwings(110, 115);
    const result = detectWaves(candles, swings, "BULLISH");
    const w4 = result.impulse.find((w) => w.label === "4");
    assert.ok(w4);
    assert.equal(w4!.structureConflict, true);
  });

  it("produces A-B-C corrective candidates after impulse", () => {
    const swings = [
      ...bullishImpulseSwings(110, 128),
      swing(12, 140, "LOW"),
      swing(14, 148, "HIGH"),
      swing(16, 132, "LOW"),
    ];
    const result = detectWaves(candles, swings, "BULLISH");
    assert.equal(result.corrective.length, 3);
    assert.deepEqual(
      result.corrective.map((w) => w.label),
      ["A", "B", "C"]
    );
  });

  it("Wave 3 expansion check leaves potential when weak", () => {
    const swings = [
      swing(0, 100, "LOW"),
      swing(2, 120, "HIGH"),
      swing(4, 110, "LOW"),
      swing(6, 125, "HIGH"),
      swing(8, 118, "LOW"),
      swing(10, 130, "HIGH"),
    ];
    const result = detectWaves(candles, swings, "BULLISH");
    const w3 = result.impulse.find((w) => w.label === "3");
    assert.ok(w3);
    assert.equal(w3!.status, "POTENTIAL");
  });
});
