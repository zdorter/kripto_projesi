import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import {
  auditHistoricalBacktestRobustness,
  auditHistoricalBacktestSelectionLookahead,
  buildDirectionRrDecisiveCrossTable,
  compareHistoricalBacktestHorizons,
} from "../historical-backtest-robustness-audit";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "../historical-position-outcome-statistics";
import type { Candle } from "../types";

function syntheticSeries(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const base = 100 + Math.sin(i / 8) * 5;
    candles.push({
      time: i * 3_600_000,
      open: base,
      high: base + 3,
      low: base - 3,
      close: base + (i % 2 === 0 ? 1 : -1),
      volume: 100 + i,
    });
  }
  return candles;
}

describe("historical-backtest-robustness-audit", () => {
  it("computes candidate multiplicity from artifact", () => {
    const report = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const audit = auditHistoricalBacktestRobustness({ report });
    assert.ok(audit.candidateMultiplicity.evaluationBarsWithSnapshots > 0);
    assert.ok(audit.candidateMultiplicity.averageCandidatesPerE >= 1);
    assert.equal(
      audit.candidateMultiplicity.totalSnapshots,
      report.artifact.measurements.length
    );
  });

  it("DISPLAY_PICK selection stable under future mutation", () => {
    const candles = syntheticSeries(200);
    const report = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      startEvaluationBar: 50,
      endEvaluationBar: 100,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lookahead = auditHistoricalBacktestSelectionLookahead({
      report,
      candles,
      evaluationBarIndices: [55, 70, 90],
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(lookahead.displayPickIdMismatches, 0);
    assert.equal(lookahead.readyFlagMismatches, 0);
    assert.equal(lookahead.tradeEvaluationStatusMismatches, 0);
  });

  it("horizon comparison is deterministic on synthetic series", () => {
    const rows = compareHistoricalBacktestHorizons({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizons: [12, 24],
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(rows.length, 2);
    assert.ok(rows[0].summary.totalSnapshots > 0);
    const again = compareHistoricalBacktestHorizons({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizons: [12, 24],
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.deepEqual(rows[0].summary, again[0].summary);
  });

  it("builds direction × RR cross without throwing", () => {
    const candles = syntheticSeries(150);
    const report = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      startEvaluationBar: 30,
      endEvaluationBar: 80,
      horizonBars: 12,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
      report.artifact,
      report.pathBatch
    );
    const table = buildDirectionRrDecisiveCrossTable(
      observations,
      report.configuration.policyId
    );
    assert.ok(typeof table === "object");
  });
});
