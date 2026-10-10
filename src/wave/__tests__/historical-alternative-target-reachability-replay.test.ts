import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import {
  buildHistoricalAlternativeTargetReachabilityReplay,
  mapReplayEventToPathOutcome,
  replayCounterfactualTargetReachability,
} from "../historical-alternative-target-reachability-replay";
import { HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION } from "../historical-alternative-target-reachability-replay-types";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";
import type { Candle } from "../types";

function frozenStack() {
  const candles = loadBtcusdt1hResearchFrozenDatasetV1().candles;
  const range = resolveRealHistoricalBacktestEvaluationRange(3000, 24);
  const result = runFrozenHistoricalBacktest({
    horizonBars: 24,
    startEvaluationBar: range.startEvaluationBar,
    endEvaluationBar: range.endEvaluationBar,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    candles,
  });
  const lifecycleReport = buildIndependentTradeLifecycleReport({
    report: result.report,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  });
  const b12v = buildHistoricalAlternativeTargetModelAnalysis({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  return { result, lifecycleReport, candles, b12v };
}

describe("historical-alternative-target-reachability-replay (B-12w)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION, "1.0");
  });

  it("B. frozen population", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetReachabilityReplay({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.lifecycleSummary.totalSnapshots, 18936);
  });

  it("C–D. replay starts E+1 and horizon", () => {
    const candles: Candle[] = [
      { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { time: 2, open: 100, high: 120, low: 100, close: 110, volume: 1 },
    ];
    const r0 = replayCounterfactualTargetReachability({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      targetPrice: 110,
      invalidationPrice: 95,
      candles,
      horizonBars: 24,
    });
    assert.equal(r0.event, "TARGET_REACHED");
    assert.equal(r0.barsToTarget, 2);
    const r1 = replayCounterfactualTargetReachability({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      targetPrice: 200,
      invalidationPrice: 95,
      candles,
      horizonBars: 1,
    });
    assert.equal(r1.event, "NOT_REACHED_WITHIN_HORIZON");
  });

  it("E–G. bullish target and bearish invalidation", () => {
    const bull = replayCounterfactualTargetReachability({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      targetPrice: 105,
      invalidationPrice: 90,
      candles: [
        { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
        { time: 1, open: 100, high: 106, low: 99, close: 104, volume: 1 },
      ],
      horizonBars: 24,
    });
    assert.equal(bull.event, "TARGET_REACHED");
    const bear = replayCounterfactualTargetReachability({
      direction: "BEARISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      targetPrice: 95,
      invalidationPrice: 105,
      candles: [
        { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
        { time: 1, open: 100, high: 106, low: 98, close: 99, volume: 1 },
      ],
      horizonBars: 24,
    });
    assert.equal(bear.event, "INVALIDATION_REACHED");
  });

  it("H. same-bar ambiguity", () => {
    const r = replayCounterfactualTargetReachability({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      targetPrice: 105,
      invalidationPrice: 95,
      candles: [
        { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
        { time: 1, open: 100, high: 110, low: 90, close: 100, volume: 1 },
      ],
      horizonBars: 24,
    });
    assert.equal(r.event, "AMBIGUOUS_SAME_BAR");
  });

  it("I–J. no touch and insufficient future", () => {
    assert.equal(
      replayCounterfactualTargetReachability({
        direction: "BULLISH",
        evaluationBarIndex: 1,
        entryPrice: 100,
        targetPrice: 200,
        invalidationPrice: 90,
        candles: [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        horizonBars: 24,
      }).event,
      "INSUFFICIENT_FUTURE"
    );
  });

  it("K. canonical parity mapping", () => {
    assert.equal(mapReplayEventToPathOutcome("TARGET_REACHED"), "TARGET_TOUCHED");
    assert.equal(mapReplayEventToPathOutcome("AMBIGUOUS_SAME_BAR"), "AMBIGUOUS");
  });

  it("L–P. displacement models on frozen", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetReachabilityReplay({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const d2 = report.modelResults.find((m) => m.modelId === "DISPLACEMENT_2_00");
    assert.ok((d2?.classifiableTrades ?? 0) > 0);
    assert.ok(d2!.targetReachRate !== null);
  });

  it("Q–R. structural prefix and extension", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetReachabilityReplay({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const s = report.modelResults.find((m) => m.modelId === "STRUCTURAL_PREFIX_EXTREME");
    assert.ok(s);
    const e = report.modelResults.find((m) => m.modelId === "STRUCTURAL_EXTENSION_1_50");
    assert.ok(e);
  });

  it("S–V. reach rates, time to target, MFE", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetReachabilityReplay({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const canon = report.modelResults.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY")!;
    assert.ok(canon.targetReachRate! > 0);
    assert.ok(report.timeToTarget.length === 11);
    assert.ok(canon.meanMfePercentage !== null);
  });

  it("W–Y. large target and evaluator slices", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetReachabilityReplay({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.largeTargetAnalysis.length > 0);
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.ok(report.passedAdverseAnalysis.trades >= 0);
  });

  it("Z–AE. crosses, no false win, determinism, immutability, b12v, guard", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      candles: pipe.candles,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    };
    const report = buildHistoricalAlternativeTargetReachabilityReplay(input);
    assert.ok(report.rrCross.length > 0);
    assert.ok(report.rewardCross.length > 0);
    assert.ok(report.directionCross.length > 0);
    for (const row of report.perTrade) {
      assert.equal(row.alternativeTheoreticalR, null);
      assert.equal(row.netReward, null);
    }
    assert.deepEqual(
      buildHistoricalAlternativeTargetReachabilityReplay(input),
      buildHistoricalAlternativeTargetReachabilityReplay(input)
    );
    const before = JSON.stringify(pipe.b12v);
    buildHistoricalAlternativeTargetReachabilityReplay(input);
    assert.equal(JSON.stringify(pipe.b12v), before);
    assert.ok(report.canonicalParity.canonicalModelReplayComparable > 0);

    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-alternative-target-reachability-replay.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalAlternativeTargetReachabilityReplay"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
  });
});
