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
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { runWaveScan } from "../wave-scanner";

describe("prospective Phase B references (14N-J)", () => {
  it("Y: natural E2E READY on demo prospective CONFIRMED path", () => {
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
    const setupDetection = detectSetups({ scanReport: scan, tradeContext });
    const setup = setupDetection.candidates.find((c) =>
      c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const production = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(production.status, "CONFIRMED");
    const refs = evaluateProspectiveReferenceBundle({
      production,
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(refs.entry.outcome, "AVAILABLE");
    assert.equal(refs.stop.outcome, "AVAILABLE");
    assert.equal(refs.target.outcome, "AVAILABLE");
    assert.equal(refs.rr.outcome, "AVAILABLE");
    assert.equal(refs.readyForFurtherEvaluation, true);
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });
});
