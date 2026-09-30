import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { detectSetups } from "../setup/setup-detector";
import { detectProspectiveSetupProduction } from "../setup/prospective-setup-production";
import { runWaveScan } from "../wave-scanner";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";

describe("prospective Phase A hard gate (14N-J)", () => {
  it("J: natural production path reaches CONFIRMED + ELIGIBLE + gate PASS on demo OHLCV", () => {
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
    const production = detectProspectiveSetupProduction({
      historicalTradeSetups: setupDetection.candidates.filter((c) => c.isTradeSetup),
      tradeContext,
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    });
    const confirmed = production.candidates.filter((c) => c.status === "CONFIRMED");
    assert.ok(confirmed.length >= 1);
    assert.ok(confirmed.some((c) => c.objectiveEligibility === "ELIGIBLE"));
    assert.ok(confirmed.some((c) => c.targetGateOutcome === "PASS"));
    assert.ok(
      confirmed.some(
        (c) => c.openLegResolution.anchorResolutionMode === "CANDIDATE_SCOPED"
      )
    );
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });
});
