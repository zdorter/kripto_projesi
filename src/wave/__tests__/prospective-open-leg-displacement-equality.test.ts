import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { detectSetups } from "../setup/setup-detector";
import {
  detectProspectiveSetupProduction,
  evaluateProspectiveSetupProduction,
} from "../setup/prospective-setup-production";
import { evaluateProspectiveReferenceBundle } from "../setup/prospective-reference-evaluation";
import {
  PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY,
  PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY,
  normalizeProspectiveTargetPolicyId,
  projectProspectiveOpenLegDisplacementEqualityTarget,
} from "../setup/prospective-open-leg-displacement-equality-policy";
import { runWaveScan } from "../wave-scanner";

describe("prospective open leg displacement equality (14N-L)", () => {
  it("unit: legacy policy id normalizes for display", () => {
    assert.equal(
      normalizeProspectiveTargetPolicyId(PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY),
      PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY
    );
  });

  it("unit: bullish golden anchor 100 entry 120 target 140", () => {
    const target = projectProspectiveOpenLegDisplacementEqualityTarget(100, 120);
    assert.equal(target, 140);
  });

  it("unit: bearish ETH golden anchor 2749.17 entry 2681.29 target 2613.41", () => {
    const target = projectProspectiveOpenLegDisplacementEqualityTarget(
      2749.17,
      2681.29
    );
    assert.equal(target, 2613.41);
  });

  it("unit: path envelope extremes do not change target (anchor 128 entry 115)", () => {
    const target = projectProspectiveOpenLegDisplacementEqualityTarget(128, 115);
    assert.equal(target, 102);
    const observedHigh = 155;
    const observedLow = 114;
    const pathRangeTarget = 115 - (observedHigh - observedLow);
    assert.notEqual(pathRangeTarget, target);
    assert.equal(pathRangeTarget, 74);
  });

  it("unit: ETH RR golden entry/stop/target ≈ 1.75", () => {
    const entry = 2681.29;
    const stop = 2720;
    const target = 2613.41;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const ratio = reward / risk;
    assert.ok(Math.abs(ratio - 1.75) < 0.01);
  });

  it("E2E DEMO bar 22: golden target 102 and policy id", () => {
    const bar = 22;
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], {
      timeframe: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      {
        BTCUSDT: {
          candles: DEMO_OHLCV,
          closedSeriesOnly: true,
          evaluationBarIndex: bar,
        },
      },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const setup = detectSetups({ scanReport: scan, tradeContext }).candidates.find(
      (c) => c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const production = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(production.status, "CONFIRMED");
    const leg = production.openLegResolution.leg!;
    assert.equal(leg.anchorPrice, 128);
    assert.equal(leg.evaluationPrice, 115);
    assert.equal(leg.observedHigh, 155);
    assert.equal(leg.observedLow, 114);

    const refs = evaluateProspectiveReferenceBundle({
      production,
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(refs.entry.referencePrice, 115);
    assert.equal(refs.target.referencePrice, 102);
    assert.equal(refs.target.policyId, PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY);
  });
});
