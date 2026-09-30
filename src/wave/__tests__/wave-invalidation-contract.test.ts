import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { analyzeWaveWithPresentation } from "../analysis-pipeline";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { detectSetups } from "../setup/setup-detector";
import {
  detectWaves,
  primaryInvalidationPrice,
  wave2StructuralInvalidationPrice,
} from "../wave-detector";
import { resolveScenarioInvalidation } from "../wave-scenarios";
import { runWaveScan } from "../wave-scanner";
import { flatCandles, swing } from "./test-helpers";

const TF = "1H";

describe("wave invalidation contract (14G)", () => {
  it("characterizes Wave 2 boundary as Wave 1 origin price", () => {
    assert.equal(wave2StructuralInvalidationPrice(100), 100);
  });

  it("valid Wave 2 exposes same boundary as invalidated Wave 2", () => {
    const candles = flatCandles(25, 100);
    const valid = detectWaves(
      candles,
      [
        swing(0, 100, "LOW"),
        swing(2, 120, "HIGH"),
        swing(4, 110, "LOW"),
        swing(6, 145, "HIGH"),
        swing(8, 128, "LOW"),
        swing(10, 155, "HIGH"),
      ],
      "BULLISH"
    );
    const invalid = detectWaves(
      candles,
      [
        swing(0, 100, "LOW"),
        swing(2, 120, "HIGH"),
        swing(4, 95, "LOW"),
        swing(6, 145, "HIGH"),
        swing(8, 128, "LOW"),
        swing(10, 155, "HIGH"),
      ],
      "BULLISH"
    );
    const w2v = valid.impulse.find((w) => w.label === "2")!;
    const w2i = invalid.impulse.find((w) => w.label === "2")!;
    assert.equal(w2v.invalidationPrice, 100);
    assert.equal(w2i.invalidationPrice, 100);
    assert.notEqual(w2v.status, "INVALIDATED");
    assert.equal(w2i.status, "INVALIDATED");
  });

  it("Wave 1 and corrective legs do not invent invalidationPrice", () => {
    const candles = flatCandles(25, 100);
    const result = detectWaves(
      candles,
      [
        swing(0, 100, "LOW"),
        swing(2, 120, "HIGH"),
        swing(4, 110, "LOW"),
        swing(6, 145, "HIGH"),
        swing(8, 128, "LOW"),
        swing(10, 155, "HIGH"),
        swing(12, 140, "LOW"),
        swing(14, 148, "HIGH"),
        swing(16, 132, "LOW"),
      ],
      "BULLISH"
    );
    const w1 = result.impulse.find((w) => w.label === "1");
    assert.equal(w1?.invalidationPrice, undefined);
    for (const w of result.corrective) {
      assert.equal(w.invalidationPrice, undefined);
    }
  });

  it("primaryInvalidationPrice uses Wave 2 structural boundary when present", () => {
    const candles = flatCandles(25, 100);
    const { impulse } = detectWaves(
      candles,
      [
        swing(0, 100, "LOW"),
        swing(2, 120, "HIGH"),
        swing(4, 110, "LOW"),
        swing(6, 145, "HIGH"),
        swing(8, 128, "LOW"),
        swing(10, 155, "HIGH"),
      ],
      "BULLISH"
    );
    assert.equal(primaryInvalidationPrice(impulse), 100);
  });

  it("propagates Wave 2 boundary through presentation track invalidation", () => {
    const { presentation } = analyzeWaveWithPresentation(
      DEMO_OHLCV,
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const track = presentation.tracks.selectedImpulse.invalidation;
    const w2 = presentation.engine.flatWaves.find((w) => w.label === "2");
    if (w2?.invalidationPrice !== undefined) {
      assert.ok(track);
      assert.equal(track!.price, w2.invalidationPrice);
    }
  });

  it("preserves exact price through scenario and scanner to setup reference", () => {
    const scan = runWaveScan(
      [{ symbol: "BTCUSDT", candles: DEMO_OHLCV }],
      { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS }
    );
    const rowWithInv = scan.results.find((r) => r.invalidation.available);
    if (!rowWithInv?.invalidation.price) {
      return;
    }
    const expected = rowWithInv.invalidation.price;
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      { BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true } },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const detection = detectSetups({ scanReport: scan, tradeContext });
    const setup = detection.candidates.find(
      (c) =>
        c.isTradeSetup &&
        c.scenarioRef.scenarioId === rowWithInv.scenarioId
    );
    if (!setup) {
      return;
    }
    const ref = setup.referenceLevels.find(
      (l) => l.kind === "SCENARIO_INVALIDATION"
    );
    assert.equal(ref?.price, expected);
  });

  it("resolveScenarioInvalidation uses WAVE_CANDIDATE when track scope absent", () => {
    const { presentation, analysis } = analyzeWaveWithPresentation(
      DEMO_OHLCV,
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const w2 = analysis.waves.find((w) => w.label === "2");
    if (!w2?.invalidationPrice) {
      return;
    }
    const inv = resolveScenarioInvalidation(presentation, null, w2);
    assert.equal(inv.available, true);
    assert.equal(inv.price, w2.invalidationPrice);
    assert.equal(inv.source, "WAVE_CANDIDATE");
  });

  it("deterministic invalidation on repeated detection", () => {
    const candles = flatCandles(25, 100);
    const swings = [
      swing(0, 100, "LOW"),
      swing(2, 120, "HIGH"),
      swing(4, 110, "LOW"),
      swing(6, 145, "HIGH"),
      swing(8, 128, "LOW"),
      swing(10, 155, "HIGH"),
    ];
    const a = detectWaves(candles, swings, "BULLISH");
    const b = detectWaves(candles, swings, "BULLISH");
    assert.deepEqual(
      a.impulse.map((w) => ({
        label: w.label,
        inv: w.invalidationPrice,
        status: w.status,
      })),
      b.impulse.map((w) => ({
        label: w.label,
        inv: w.invalidationPrice,
        status: w.status,
      }))
    );
  });
});
