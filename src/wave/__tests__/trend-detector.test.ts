import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyHighStructure,
  classifyLowStructure,
  detectTrend,
} from "../trend-detector";
import { swing } from "./test-helpers";

describe("trend-detector", () => {
  it("classifies HH", () => {
    const a = swing(1, 100, "HIGH");
    const b = swing(5, 110, "HIGH");
    assert.equal(classifyHighStructure(a, b), "HH");
  });

  it("classifies HL", () => {
    const a = swing(1, 90, "LOW");
    const b = swing(5, 95, "LOW");
    assert.equal(classifyLowStructure(a, b), "HL");
  });

  it("classifies LH", () => {
    const a = swing(1, 110, "HIGH");
    const b = swing(5, 105, "HIGH");
    assert.equal(classifyHighStructure(a, b), "LH");
  });

  it("classifies LL", () => {
    const a = swing(1, 95, "LOW");
    const b = swing(5, 90, "LOW");
    assert.equal(classifyLowStructure(a, b), "LL");
  });

  it("detects BULLISH trend from HH and HL", () => {
    const swings = [
      swing(1, 90, "LOW"),
      swing(3, 100, "HIGH"),
      swing(5, 95, "LOW"),
      swing(7, 110, "HIGH"),
    ];
    assert.equal(detectTrend(swings), "BULLISH");
  });

  it("detects BEARISH trend from LH and LL", () => {
    const swings = [
      swing(1, 110, "HIGH"),
      swing(3, 100, "LOW"),
      swing(5, 105, "HIGH"),
      swing(7, 90, "LOW"),
    ];
    assert.equal(detectTrend(swings), "BEARISH");
  });

  it("returns NEUTRAL when structure mixed", () => {
    const swings = [
      swing(1, 90, "LOW"),
      swing(3, 100, "HIGH"),
      swing(5, 88, "LOW"),
      swing(7, 95, "HIGH"),
    ];
    assert.equal(detectTrend(swings), "NEUTRAL");
  });
});
