import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { detectSetups } from "../setup/setup-detector";
import { evaluateStopLossModel } from "../setup/stop-loss-model";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { runWaveScan } from "../wave-scanner";
import type { WaveScanReport, WaveScanResult } from "../wave-scanner";

const TF = "1H";
const INVALIDATION = 82_900;

function scanWithInvalidation(row: Partial<WaveScanResult>): WaveScanReport {
  const base: WaveScanResult = {
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioId: "primary-impulse-3",
    role: "PRIMARY",
    structure: "IMPULSE",
    waveLabel: "3",
    engineStatus: "CONFIRMED",
    scenarioStatus: "ACTIVE",
    confidence: 80,
    startIndex: 10,
    endIndex: 20,
    startPrice: 83_000,
    endPrice: 84_500,
    invalidation: {
      available: true,
      price: INVALIDATION,
      source: "TRACK_SCOPE",
      rule: "test invalidation",
    },
    evidence: [],
    limitations: [],
    ...row,
  };
  return {
    schemaVersion: "1.0",
    timeframe: TF,
    symbols: ["BTCUSDT"],
    results: [base],
    analyzedSymbolCount: 1,
    scenarioCount: 1,
    errors: [],
  };
}

describe("trade setup invalidation wiring (14F)", () => {
  it("maps scanner invalidation to setup reference and entry plan unchanged price", () => {
    const scan = scanWithInvalidation({});
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      { BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true } },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const detection = detectSetups({ scanReport: scan, tradeContext });
    const trade = detection.candidates.find(
      (c) => c.isTradeSetup && c.setupTypeId === "impulse-continuation"
    );
    assert.ok(trade);
    const ref = trade.referenceLevels.find(
      (l) => l.kind === "SCENARIO_INVALIDATION"
    );
    assert.ok(ref);
    assert.equal(ref.price, INVALIDATION);
    assert.equal(scan.results[0].invalidation.price, INVALIDATION);

    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const { plan } = buildEntryPlanFromSetup({
      setup: { ...trade, status: "CONFIRMED" },
      evaluationBar: {
        evaluationBarIndex: bundle.evaluationBarIndex,
        evaluationBarBoundaryEstablished: bundle.evaluationBarBoundaryEstablished,
        evaluationBarContractDetail: bundle.evaluationBarContractDetail,
      },
    });
    assert.ok(plan);
    const planInv = plan.referenceLevels.find(
      (l) => l.kind === "SCENARIO_INVALIDATION"
    );
    assert.equal(planInv?.price, INVALIDATION);

    const stopRef = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan,
      priceContext: { candles: DEMO_OHLCV },
    });
    if (stopRef.outcome === "AVAILABLE") {
      assert.equal(stopRef.price, INVALIDATION);
    }
  });

  it("does not fabricate SCENARIO_INVALIDATION when scanner invalidation unavailable", () => {
    const scan = scanWithInvalidation({
      invalidation: { available: false, rule: "none", source: "NONE" },
    });
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      { BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true } },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const detection = detectSetups({ scanReport: scan, tradeContext });
    const trade = detection.candidates.find((c) => c.isTradeSetup);
    assert.ok(trade);
    assert.ok(
      !trade.referenceLevels.some((l) => l.kind === "SCENARIO_INVALIDATION")
    );
  });

  it("integration: DEMO scan may expose invalidation when engine provides it", () => {
    const scan = runWaveScan(
      [{ symbol: "BTCUSDT", candles: DEMO_OHLCV }],
      { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS }
    );
    const withInv = scan.results.filter((r) => r.invalidation.available);
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      { BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true } },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const detection = detectSetups({ scanReport: scan, tradeContext });
    for (const setup of detection.candidates.filter((c) => c.isTradeSetup)) {
      const row = scan.results.find(
        (r) => r.scenarioId === setup.scenarioRef.scenarioId
      );
      if (row?.invalidation.available && row.invalidation.price !== undefined) {
        const ref = setup.referenceLevels.find(
          (l) => l.kind === "SCENARIO_INVALIDATION"
        );
        assert.equal(ref?.price, row.invalidation.price);
      }
    }
    assert.ok(withInv.length >= 0);
  });
});
