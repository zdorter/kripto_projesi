import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidatePair,
  buildCandidateWaveHierarchy,
  classifyCandidateNesting,
  classifyPriceRelation,
  classifyTimeRelation,
  type HierarchyWaveSegment,
} from "../wave-hierarchy";
import { analyzeMultiTimeframe } from "../multi-timeframe";
import { flatCandles } from "./test-helpers";

function segment(
  tf: string,
  label: HierarchyWaveSegment["label"],
  structure: "IMPULSE" | "CORRECTIVE",
  times: { start: number; end: number },
  prices: { low: number; high: number },
  status: HierarchyWaveSegment["status"] = "CONFIRMED"
): HierarchyWaveSegment {
  return {
    timeframeId: tf,
    structure,
    label,
    status,
    startIndex: 0,
    endIndex: 10,
    startTime: times.start,
    endTime: times.end,
    lowPrice: prices.low,
    highPrice: prices.high,
    invalidated: status === "INVALIDATED",
  };
}

describe("wave-hierarchy", () => {
  it("classifies TIME_CONTAINED", () => {
    const higher = segment("1H", "5", "IMPULSE", { start: 100, end: 200 }, { low: 90, high: 110 });
    const lower = segment("15M", "C", "CORRECTIVE", { start: 120, end: 180 }, { low: 95, high: 105 });
    assert.equal(classifyTimeRelation(higher, lower), "TIME_CONTAINED");
  });

  it("classifies TIME_OVERLAPPING without containment", () => {
    const higher = segment("1H", "3", "IMPULSE", { start: 100, end: 200 }, { low: 90, high: 110 });
    const lower = segment("15M", "1", "IMPULSE", { start: 150, end: 250 }, { low: 92, high: 108 });
    assert.equal(classifyTimeRelation(higher, lower), "TIME_OVERLAPPING");
  });

  it("classifies PRICE_CONTAINED", () => {
    const higher = segment("1H", "5", "IMPULSE", { start: 1, end: 2 }, { low: 100, high: 200 });
    const lower = segment("15M", "C", "CORRECTIVE", { start: 1, end: 2 }, { low: 120, high: 180 });
    assert.equal(classifyPriceRelation(higher, lower), "PRICE_CONTAINED");
  });

  it("classifies PRICE_OVERLAPPING", () => {
    const higher = segment("1H", "5", "IMPULSE", { start: 1, end: 2 }, { low: 100, high: 150 });
    const lower = segment("15M", "C", "CORRECTIVE", { start: 1, end: 2 }, { low: 130, high: 200 });
    assert.equal(classifyPriceRelation(higher, lower), "PRICE_OVERLAPPING");
  });

  it("classifies PRICE_DISJOINT", () => {
    const higher = segment("1H", "5", "IMPULSE", { start: 1, end: 2 }, { low: 100, high: 110 });
    const lower = segment("15M", "C", "CORRECTIVE", { start: 1, end: 2 }, { low: 200, high: 220 });
    assert.equal(classifyPriceRelation(higher, lower), "PRICE_DISJOINT");
  });

  it("TIME_CONTAINED + PRICE_CONTAINED → NESTED_CANDIDATE", () => {
    assert.equal(
      classifyCandidateNesting("TIME_CONTAINED", "PRICE_CONTAINED"),
      "NESTED_CANDIDATE"
    );
  });

  it("TIME_CONTAINED + PRICE_OVERLAPPING → POSSIBLE_NESTING", () => {
    assert.equal(
      classifyCandidateNesting("TIME_CONTAINED", "PRICE_OVERLAPPING"),
      "POSSIBLE_NESTING"
    );
  });

  it("TIME_DISJOINT → NO_RELATIONSHIP", () => {
    const higher = segment("1H", "1", "IMPULSE", { start: 100, end: 200 }, { low: 10, high: 20 });
    const lower = segment("15M", "2", "IMPULSE", { start: 300, end: 400 }, { low: 10, high: 20 });
    const pair = buildCandidatePair(higher, lower);
    assert.equal(pair.timeRelation, "TIME_DISJOINT");
    assert.equal(pair.relationship, "NO_RELATIONSHIP");
  });

  it("identifies primary pair from multi-timeframe state", () => {
    const higher = flatCandles(60, 100);
    const lower = flatCandles(80, 100);
    for (let i = 0; i < higher.length; i++) {
      higher[i].high += Math.sin(i / 4) * 15;
      higher[i].low += Math.sin(i / 4) * 15;
    }
    for (let i = 0; i < lower.length; i++) {
      lower[i].high += Math.cos(i / 3) * 10;
      lower[i].low += Math.cos(i / 3) * 10;
    }
    const mtf = analyzeMultiTimeframe(higher, lower);
    const report = buildCandidateWaveHierarchy(mtf, higher, lower);
    if (mtf.higherTimeframe.primaryFocus.wave && mtf.lowerTimeframe.primaryFocus.wave) {
      assert.ok(report.primaryPair);
      assert.equal(
        report.primaryPair.higherWave.label,
        mtf.higherTimeframe.primaryFocus.wave
      );
      assert.equal(
        report.primaryPair.lowerWave.label,
        mtf.lowerTimeframe.primaryFocus.wave
      );
    }
  });

  it("marks invalidated waves on segments", () => {
    const higher = segment("1H", "2", "IMPULSE", { start: 1, end: 2 }, { low: 1, high: 2 }, "INVALIDATED");
    assert.equal(higher.invalidated, true);
  });

  it("sorts candidates deterministically", () => {
    const higher = flatCandles(50, 100);
    const lower = flatCandles(50, 100);
    const mtf = analyzeMultiTimeframe(higher, lower);
    const a = buildCandidateWaveHierarchy(mtf, higher, lower);
    const b = buildCandidateWaveHierarchy(mtf, higher, lower);
    assert.deepEqual(
      a.candidates.map((c) => `${c.higherWave.label}-${c.lowerWave.label}`),
      b.candidates.map((c) => `${c.higherWave.label}-${c.lowerWave.label}`)
    );
  });
});
