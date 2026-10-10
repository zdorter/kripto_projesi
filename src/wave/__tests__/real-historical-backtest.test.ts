import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  auditRealHistoricalEvaluationLookahead,
  auditRealHistoricalFirstDecisiveEvents,
} from "../real-historical-backtest-audit";
import {
  resolveRealHistoricalBacktestEvaluationRange,
  runRealHistoricalBacktest,
} from "../real-historical-backtest";
import { auditHistoricalBacktestReport } from "../historical-backtest-validation";
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

describe("real-historical-backtest", () => {
  it("resolves end evaluation bar leaving full horizon window", () => {
    const range = resolveRealHistoricalBacktestEvaluationRange(3000, 24);
    assert.equal(range.endEvaluationBar, 3000 - 1 - 24);
    assert.equal(range.startEvaluationBar, 0);
  });

  it("runs B-10f twice with identical deterministic output on synthetic data", () => {
    const candles = syntheticSeries(400);
    const input = {
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      horizonBars: 24,
      startEvaluationBar: 50,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    };
    const a = runRealHistoricalBacktest(input);
    const b = runRealHistoricalBacktest(input);
    assert.deepEqual(
      a.report.outcomeStatistics.overall.counts,
      b.report.outcomeStatistics.overall.counts
    );
    assert.deepEqual(a.pathOutcomeCounts, b.pathOutcomeCounts);
  });

  it("validates OHLC and runs backtest on synthetic 1H series", () => {
    const candles = syntheticSeries(400);
    const range = resolveRealHistoricalBacktestEvaluationRange(candles.length, 24);
    const result = runRealHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      startEvaluationBar: 80,
      endEvaluationBar: range.endEvaluationBar,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(result.dataset.candleCount, 400);
    assert.ok(result.report.configuration.rangeError === null);
  });

  it("first-decisive and lookahead audits pass on synthetic integration", () => {
    const candles = syntheticSeries(400);
    const result = runRealHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      startEvaluationBar: 80,
      endEvaluationBar: 120,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const audit = auditHistoricalBacktestReport({
      report: result.report,
      candles,
    });
    assert.equal(audit.issues.length, 0);
    const firstDecisive = auditRealHistoricalFirstDecisiveEvents({
      report: result.report,
      candles,
    });
    assert.equal(firstDecisive.length, 0);
    const lookahead = auditRealHistoricalEvaluationLookahead({
      report: result.report,
      candles,
      evaluationBarIndices: [80, 90],
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(lookahead.length, 0);
  });
});
