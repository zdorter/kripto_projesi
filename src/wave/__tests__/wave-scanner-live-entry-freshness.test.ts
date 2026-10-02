import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runProductionWaveScanner } from "../production-wave-scanner";
import { formatTradeEvaluationDetailsSection } from "../setup/trade-evaluation-presentation";

describe("wave scanner live entry freshness (B-4)", () => {
  it("LIVE composition: mock ticker map drives entry freshness", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      liveMarketPriceBySymbol: { BTCUSDT: 102 },
    });
    const te = report.rows[0]!.details.tradeEvaluation!;
    assert.equal(te.checks.entry, "STALE");
    assert.equal(te.firstFailure, "ENTRY_STALE");
    assert.equal(report.rows[0]!.readyForFurtherEvaluation, true);
    assert.equal(report.rows[0]!.entryReference.price, 115);
  });

  it("ticker failure: structural row intact, trade eval insufficient", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      liveMarketPriceBySymbol: { BTCUSDT: null },
    });
    const row = report.rows[0]!;
    assert.equal(row.readyForFurtherEvaluation, true);
    assert.equal(row.tradeEvaluation.status, "INSUFFICIENT_CONTEXT");
    assert.equal(row.entryReference.price, 115);
  });

  it("details section shows entry ref, eval close, live price", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      liveMarketPriceBySymbol: { BTCUSDT: 115 },
    });
    const html = formatTradeEvaluationDetailsSection(
      report.rows[0]!.details.tradeEvaluation
    );
    assert.ok(html.includes("Entry Reference"));
    assert.ok(html.includes("Evaluation Close"));
    assert.ok(html.includes("Live Market Price"));
    assert.ok(html.includes("Entry Freshness"));
  });
});
