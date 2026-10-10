import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeIndependentTradeStatistics,
} from "../historical-independent-trade-analysis";
import {
  aggregateIndependentTradeStatistics,
} from "../historical-independent-trade-statistics";
import {
  classifyStatisticalEvidence,
  compareIndependentTradeGroups,
  computeIndependentTradeWinRateConfidenceInterval,
  IndependentTradeStatisticalValidationError,
  testIndependentTradeWinRateAgainstBaseline,
  validateIndependentTradeStatistics,
} from "../historical-independent-trade-statistical-validation";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";

describe("historical-independent-trade-statistical-validation", () => {
  it("overall Wilson CI locked for BTC 131/285 at 95%", () => {
    const ci = computeIndependentTradeWinRateConfidenceInterval(131, 154, 0.95);
    assert.equal(ci.numerator, 131);
    assert.equal(ci.denominator, 285);
    assert.equal(ci.value, 131 / 285);
    assert.equal(ci.lower, 0.40270952355468204);
    assert.equal(ci.upper, 0.5176620183496337);
    assert.equal(ci.method, "WILSON_SCORE_INTERVAL");
  });

  it("90% and 99% confidence levels", () => {
    const ci90 = computeIndependentTradeWinRateConfidenceInterval(50, 50, 0.9);
    const ci99 = computeIndependentTradeWinRateConfidenceInterval(50, 50, 0.99);
    assert.ok(ci90.upper! < ci99.upper!);
    assert.ok(ci90.lower! > ci99.lower!);
  });

  it("zero denominator CI", () => {
    const ci = computeIndependentTradeWinRateConfidenceInterval(0, 0, 0.95);
    assert.equal(ci.value, null);
    assert.equal(ci.lower, null);
  });

  it("all wins and all losses edge cases", () => {
    const allWins = computeIndependentTradeWinRateConfidenceInterval(10, 0, 0.95);
    assert.equal(allWins.value, 1);
    assert.ok(allWins.lower! < 1);
    const allLosses = computeIndependentTradeWinRateConfidenceInterval(0, 10, 0.95);
    assert.equal(allLosses.value, 0);
    assert.ok(allLosses.upper! > 0);
  });

  it("50/50 baseline test not significant at 95% for large n", () => {
    const bt = testIndependentTradeWinRateAgainstBaseline(500, 500, 0.5);
    assert.equal(bt.significantAt95, false);
  });

  it("BTC 131/285 baseline 50% two-sided binomial", () => {
    const bt = testIndependentTradeWinRateAgainstBaseline(131, 154, 0.5);
    assert.equal(bt.pValue, 0.19242713586651514);
    assert.equal(bt.significantAt95, false);
  });

  it("PASSED vs FAILED comparison locked", () => {
    const comp = compareIndependentTradeGroups(
      { wins: 33, losses: 89 },
      { wins: 98, losses: 65 }
    );
    assert.equal(comp.groupA.rate, 33 / 122);
    assert.equal(comp.groupB.rate, 98 / 163);
    assert.equal(comp.evidenceLabel, "EVIDENCE_OF_DIFFERENCE");
    assert.equal(comp.significantAt95, true);
    assert.ok(comp.pValue! < 0.05);
  });

  it("invalid confidence level throws", () => {
    assert.throws(
      () => computeIndependentTradeWinRateConfidenceInterval(1, 1, 0.85),
      IndependentTradeStatisticalValidationError
    );
  });

  it("invalid baseline throws", () => {
    assert.throws(
      () => testIndependentTradeWinRateAgainstBaseline(1, 1, 0),
      IndependentTradeStatisticalValidationError
    );
    assert.throws(
      () => testIndependentTradeWinRateAgainstBaseline(1, 1, 1),
      IndependentTradeStatisticalValidationError
    );
  });

  it("classifyStatisticalEvidence", () => {
    assert.equal(classifyStatisticalEvidence(0.01, 0.05), "SIGNIFICANT_AT_ALPHA");
    assert.equal(classifyStatisticalEvidence(0.2, 0.05), "NOT_SIGNIFICANT_AT_ALPHA");
    assert.equal(classifyStatisticalEvidence(null, 0.05), "INSUFFICIENT_SAMPLE");
  });

  it("validateIndependentTradeStatistics parity with pipeline", () => {
    const backtest = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycle = buildIndependentTradeLifecycleReport({ report: backtest });
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    const beforeStats = JSON.stringify(stats);
    const beforeAnalysis = JSON.stringify(analysis);
    const validation = validateIndependentTradeStatistics({
      statisticsReport: stats,
      analysisReport: analysis,
    });
    assert.equal(JSON.stringify(stats), beforeStats);
    assert.equal(JSON.stringify(analysis), beforeAnalysis);
    assert.equal(
      validation.overall.wins,
      stats.overall.counts.wins
    );
    assert.equal(
      validation.overall.losses,
      stats.overall.counts.losses
    );
    assert.ok(validation.warnings.temporalDependence.warning);
    assert.ok(validation.warnings.multipleComparisons.warning);
  });

  it("direction and evaluation slices include CI", () => {
    const backtest = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycle = buildIndependentTradeLifecycleReport({ report: backtest });
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const validation = validateIndependentTradeStatistics({ statisticsReport: stats });
    assert.ok(validation.byDirection.BULLISH.confidenceInterval);
    assert.ok(validation.byEvaluation.PASSED.baselineTest);
  });

  it("deterministic repeated validation", () => {
    const backtest = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycle = buildIndependentTradeLifecycleReport({ report: backtest });
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const a = validateIndependentTradeStatistics({ statisticsReport: stats });
    const b = validateIndependentTradeStatistics({ statisticsReport: stats });
    assert.deepEqual(a, b);
  });

  it("synthetic BTC population parity on evaluation cross", () => {
    const backtest = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycle = buildIndependentTradeLifecycleReport({ report: backtest });
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const validation = validateIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(validation.byEvaluation.PASSED.wins, stats.evaluationCross.PASSED.FAVORABLE_RESOLUTION);
    assert.equal(validation.byEvaluation.FAILED.wins, stats.evaluationCross.FAILED.FAVORABLE_RESOLUTION);
  });

  it("architecture guard: no path/PnL/optimization", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-independent-trade-statistical-validation.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("validateIndependentTradeStatistics"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("aggregateIndependentTradeStatistics"));
    assert.ok(!mod.includes("analyzeIndependentTradeStatistics"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("calculatePnL"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!mod.includes("optimize("));
  });
});
