import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeMultiTimeframe, buildTimeframeBundle } from "../multi-timeframe";
import { buildCandidateWaveHierarchy } from "../wave-hierarchy";
import {
  buildWaveScenarios,
  buildWaveScenarioSet,
  mapEngineStatusToScenarioStatus,
  resolveScenarioInvalidation,
} from "../wave-scenarios";
import { analyzeWaveWithPresentation } from "../analysis-pipeline";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { flatCandles } from "./test-helpers";
import type { WavePresentationState } from "../presentation-state";
import type { WaveCandidate } from "../types";

const RELAXED_SWING = {
  swing: { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 },
};

function wavyCandles(count: number): ReturnType<typeof flatCandles> {
  const candles = flatCandles(count, 100);
  for (let i = 0; i < candles.length; i++) {
    const w = Math.sin(i / 5) * 12;
    candles[i].high += w;
    candles[i].low += w;
    candles[i].close += w;
  }
  return candles;
}

describe("wave-scenarios", () => {
  it("builds primary scenario from presentation focus", () => {
    const bundle = buildTimeframeBundle(
      DEMO_OHLCV,
      "1H",
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const report = buildWaveScenarios(bundle);
    const primary = report.scenarios.find((s) => s.role === "PRIMARY");
    assert.ok(bundle.presentation.primary);
    assert.ok(primary);
    assert.ok(["ACTIVE", "INVALIDATED", "INSUFFICIENT_CONTEXT"].includes(primary.status));
    assert.equal(primary.waveLabel, bundle.presentation.primary?.wave);
  });

  it("builds alternative scenario when presentation has alternative", () => {
    const candles = flatCandles(80, 100);
    for (let i = 0; i < candles.length; i++) {
      candles[i].high += Math.sin(i / 4) * 10;
      candles[i].low += Math.sin(i / 4) * 10;
    }
    const bundle = buildTimeframeBundle(candles, "1H");
    const report = buildWaveScenarios(bundle);
    if (bundle.presentation.alternative) {
      const alt = report.scenarios.find((s) => s.role === "ALTERNATIVE");
      assert.ok(alt);
      assert.equal(alt.waveLabel, bundle.presentation.alternative.wave);
    }
  });

  it("maps invalidated engine leg to INVALIDATED scenario status", () => {
    assert.equal(
      mapEngineStatusToScenarioStatus("INVALIDATED", true),
      "INVALIDATED"
    );
    const candles = flatCandles(25, 100);
    const { presentation } = analyzeWaveWithPresentation(candles, {
      swing: { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 },
    });
    const invalidated = presentation.engine.flatWaves.find(
      (w) => w.status === "INVALIDATED"
    );
    if (invalidated) {
      const bundle = buildTimeframeBundle(candles, "1H", {
        swing: { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 },
      });
      const cand = buildWaveScenarios(bundle).scenarios.find(
        (s) => s.role === "CANDIDATE" && s.waveLabel === invalidated.label
      );
      assert.ok(cand);
      assert.equal(cand.status, "INVALIDATED");
    }
  });

  it("returns INSUFFICIENT_CONTEXT when segment is missing", () => {
    assert.equal(
      mapEngineStatusToScenarioStatus("CONFIRMED", false),
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("reports missing invalidation when engine provides none", () => {
    const presentation = {
      primary: null,
      alternative: null,
      tracks: {
        selectedImpulse: {
          invalidation: null,
          legs: [],
        },
        corrective: null,
        rivalImpulse: null,
      },
    } as unknown as WavePresentationState;
    const wave: WaveCandidate = {
      label: "1",
      startIndex: 0,
      endIndex: 2,
      confidence: 40,
      status: "POTENTIAL",
    };
    const inv = resolveScenarioInvalidation(presentation, null, wave);
    assert.equal(inv.available, false);
    assert.equal(inv.source, "NONE");
  });

  it("creates one candidate scenario per flat engine wave", () => {
    const candles = flatCandles(70, 50);
    for (let i = 0; i < candles.length; i++) {
      candles[i].high += Math.sin(i / 3) * 8;
      candles[i].low += Math.sin(i / 3) * 8;
    }
    const bundle = buildTimeframeBundle(candles, "15M");
    const report = buildWaveScenarios(bundle);
    const candidates = report.scenarios.filter((s) => s.role === "CANDIDATE");
    assert.equal(candidates.length, bundle.presentation.engine.flatWaves.length);
  });

  it("attaches hierarchy evidence when hierarchy report is provided", () => {
    const higher = flatCandles(60, 100);
    const lower = flatCandles(60, 100);
    for (let i = 0; i < higher.length; i++) {
      higher[i].high += Math.sin(i / 4) * 14;
      higher[i].low += Math.sin(i / 4) * 14;
    }
    for (let i = 0; i < lower.length; i++) {
      lower[i].high += Math.cos(i / 3) * 9;
      lower[i].low += Math.cos(i / 3) * 9;
    }
    const mtf = analyzeMultiTimeframe(higher, lower);
    const hierarchy = buildCandidateWaveHierarchy(mtf, higher, lower);
    const report = buildWaveScenarios(mtf.higherTimeframe, { hierarchy });
    const withHierarchy = report.scenarios.some((s) =>
      s.evidence.some((e) => e.includes("Hierarchy"))
    );
    if (hierarchy.primaryPair || hierarchy.highlightedCandidates.length > 0) {
      assert.ok(withHierarchy);
    }
  });

  it("attaches MTF evidence when multi-timeframe state is provided", () => {
    const higher = flatCandles(50, 100);
    const lower = flatCandles(50, 100);
    const mtf = analyzeMultiTimeframe(higher, lower);
    const report = buildWaveScenarios(mtf.lowerTimeframe, {
      multiTimeframe: mtf,
    });
    assert.ok(
      report.scenarios.every((s) =>
        s.evidence.some((e) => e.includes("Multi-timeframe"))
      )
    );
  });

  it("propagates confidence from focus / wave leg", () => {
    const bundle = buildTimeframeBundle(
      DEMO_OHLCV,
      "1H",
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const primary = buildWaveScenarios(bundle).scenarios.find(
      (s) => s.role === "PRIMARY"
    );
    assert.ok(primary);
    assert.equal(primary.confidence, bundle.presentation.primary?.confidence);
  });

  it("produces deterministic sorted scenario output", () => {
    const candles = flatCandles(55, 80);
    for (let i = 0; i < candles.length; i++) {
      candles[i].close += Math.sin(i / 6) * 5;
    }
    const bundle = buildTimeframeBundle(candles, "1H");
    const a = buildWaveScenarios(bundle);
    const b = buildWaveScenarios(bundle);
    assert.deepEqual(
      a.scenarios.map((s) => s.id),
      b.scenarios.map((s) => s.id)
    );
  });

  it("buildWaveScenarioSet returns higher and lower reports", () => {
    const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
      higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const set = buildWaveScenarioSet(mtf);
    assert.equal(set.higher.timeframeId, "1H");
    assert.equal(set.lower.timeframeId, "15M");
    assert.ok(set.higher.scenarios.length > 0);
    assert.ok(set.lower.scenarios.length > 0);
  });
});
