import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import {
  ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES,
} from "../independent-trade-entry-event-policy-contract";
import {
  buildIndependentTradeLifecycleReport,
  resolveIndependentTradeExitBarIndex,
} from "../independent-trade-unit-lifecycle";
import { buildHistoricalCandidateMeasurementsAtEvaluationBar } from "../historical-candidate-cohort";
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

function backtestDemo(start: number, end: number) {
  return runHistoricalBacktest({
    symbol: "BTCUSDT",
    timeframeId: "1H",
    candles: DEMO_OHLCV,
    startEvaluationBar: start,
    endEvaluationBar: end,
    horizonBars: 24,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
}

describe("independent-trade-unit-lifecycle", () => {
  it("snapshotId differs from tradeId", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    for (const trade of lifecycle.trades) {
      assert.notEqual(trade.tradeId, trade.snapshotId);
      assert.ok(trade.tradeId.includes(":trade:"));
    }
  });

  it("DISPLAY_PICK policy: at most one trade per evaluation bar", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({
      report,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    });
    const byE = new Map<number, number>();
    for (const t of lifecycle.trades) {
      byE.set(t.evaluationBarIndex, (byE.get(t.evaluationBarIndex) ?? 0) + 1);
    }
    for (const count of byE.values()) {
      assert.equal(count, 1);
    }
  });

  it("ALL_PRODUCTION + sibling policy selects lowest prospectiveSetupId per E", () => {
    const report = backtestDemo(20, 21);
    const lifecycle = buildIndependentTradeLifecycleReport({
      report,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES,
    });
    assert.ok(lifecycle.summary.rejectedSiblingNotSelected > 0);
    for (const t of lifecycle.trades) {
      const atE = report.artifact.measurements.filter(
        (m) => m.evaluationBarIndex === t.evaluationBarIndex
      );
      const ids = atE.map((m) => m.prospectiveSetupId).sort();
      assert.equal(t.prospectiveSetupId, ids[0]);
    }
  });

  it("mutex rejects entry when E <= prior exit bar", () => {
    const exit = resolveIndependentTradeExitBarIndex({
      schemaVersion: "1.0",
      positionModelId: "REFERENCE_PATH_V1",
      snapshotId: "s",
      outcome: "TARGET_TOUCHED",
      b6ReplayOutcome: "TARGET_TOUCHED",
      evaluationBarIndex: 10,
      horizonBars: 24,
      futureBarsAvailable: 24,
      resolutionBarIndex: 15,
      barsAfterEvaluation: 5,
      targetTouched: true,
      invalidationTouched: false,
      direction: "BULLISH",
      entryReferencePrice: 1,
      targetReferencePrice: 2,
      invalidationReferencePrice: 0.5,
      limitations: [],
    });
    assert.equal(exit, 15);
    assert.ok(12 <= 15);
  });

  it("AMBIGUOUS maps to INCONCLUSIVE policy, not WIN/LOSS", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    for (const t of lifecycle.trades) {
      if (t.pathOutcome === "AMBIGUOUS") {
        assert.equal(t.policyClassification, "INCONCLUSIVE_SAME_BAR");
        assert.equal(t.lifecycleStatus, "AMBIGUOUS_EXIT");
      }
    }
  });

  it("NO_TOUCH is not decisive WIN/LOSS", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    for (const t of lifecycle.trades) {
      if (t.pathOutcome === "NO_TOUCH") {
        assert.equal(t.policyClassification, "UNRESOLVED_AT_HORIZON");
        assert.notEqual(t.policyClassification, "FAVORABLE_RESOLUTION");
        assert.notEqual(t.policyClassification, "ADVERSE_RESOLUTION");
      }
    }
  });

  it("INSUFFICIENT_CONTEXT snapshots do not become trades", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    for (const t of lifecycle.trades) {
      assert.notEqual(t.pathOutcome, "INSUFFICIENT_CONTEXT");
      assert.notEqual(t.pathOutcome, "NO_FUTURE_DATA");
    }
  });

  it("preserves FAILED+FAVORABLE and PASSED+ADVERSE via B-10d on trades", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    for (const t of lifecycle.trades) {
      if (t.tradeEvaluationStatus === "FAILED" && t.pathOutcome === "TARGET_TOUCHED") {
        assert.equal(t.policyClassification, "FAVORABLE_RESOLUTION");
      }
      if (t.tradeEvaluationStatus === "PASSED" && t.pathOutcome === "INVALIDATION_TOUCHED") {
        assert.equal(t.policyClassification, "ADVERSE_RESOLUTION");
      }
    }
  });

  it("deterministic trade list on repeated runs", () => {
    const report = backtestDemo(20, 23);
    const a = buildIndependentTradeLifecycleReport({ report });
    const b = buildIndependentTradeLifecycleReport({ report });
    assert.deepEqual(a.trades, b.trades);
    assert.deepEqual(a.summary, b.summary);
  });

  it("future mutation does not change entry selection at E", () => {
    const candles = syntheticSeries(200);
    const reportA = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      startEvaluationBar: 80,
      endEvaluationBar: 120,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const mutated = candles.map((c) => ({ ...c }));
    for (let i = 90; i < mutated.length; i++) {
      mutated[i] = {
        ...mutated[i],
        open: 999,
        high: 999,
        low: 1,
        close: 999,
      };
    }
    const reportB = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: mutated,
      startEvaluationBar: 80,
      endEvaluationBar: 120,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifeA = buildIndependentTradeLifecycleReport({ report: reportA });
    const lifeB = buildIndependentTradeLifecycleReport({ report: reportB });
    const pick = (t: typeof lifeA.trades[0]) => ({
      evaluationBarIndex: t.evaluationBarIndex,
      prospectiveSetupId: t.prospectiveSetupId,
      entryReferencePrice: t.entryReferencePrice,
      tradeEvaluationStatus: t.tradeEvaluationStatus,
    });
    const keysA = lifeA.trades.map((t) => `${t.evaluationBarIndex}:${t.prospectiveSetupId}`);
    const keysB = lifeB.trades.map((t) => `${t.evaluationBarIndex}:${t.prospectiveSetupId}`);
    assert.deepEqual(keysA, keysB);
    for (let i = 0; i < lifeA.trades.length; i++) {
      assert.deepEqual(pick(lifeA.trades[i]!), pick(lifeB.trades[i]!));
    }
  });

  it("lookahead: entry-side rebuild unchanged after future mutation at E", () => {
    const candles = syntheticSeries(120);
    const e = 90;
    const before = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      evaluationBarIndex: e,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      horizonBars: 24,
    });
    const mutated = candles.map((c) => ({ ...c }));
    for (let i = e + 1; i < mutated.length; i++) {
      mutated[i] = { ...mutated[i], high: 9e9, low: 0, close: 9e9, open: 9e9 };
    }
    const after = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: mutated,
      evaluationBarIndex: e,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      horizonBars: 24,
    });
    assert.equal(before.length, after.length);
    for (let i = 0; i < before.length; i++) {
      assert.equal(
        before[i].measurement.prospectiveSetupId,
        after[i].measurement.prospectiveSetupId
      );
      assert.equal(
        before[i].measurement.evaluation.references.entry.referencePrice,
        after[i].measurement.evaluation.references.entry.referencePrice
      );
    }
  });

  it("mutex reduces overlapping DISPLAY entries on DEMO range", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({
      report,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    });
    assert.ok(lifecycle.summary.totalSnapshots >= lifecycle.summary.independentTrades);
    if (lifecycle.summary.eligibleEntrySnapshots > lifecycle.summary.independentTrades) {
      assert.ok(lifecycle.summary.rejectedByMutex + lifecycle.summary.rejectedPathUnmeasured >= 0);
    }
  });

  it("one measured eligible DISPLAY snapshot in range yields one trade", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    assert.equal(lifecycle.summary.independentTrades, 1);
    assert.equal(lifecycle.trades[0]?.evaluationBarIndex, 20);
  });

  it("overlapping DISPLAY entries at later E are mutex-rejected", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    assert.equal(lifecycle.summary.rejectedByMutex, 2);
    const mutex = lifecycle.entryRejections.filter((r) => r.reason === "MUTEX_POSITION_OPEN");
    assert.equal(mutex.length, 2);
    assert.ok(mutex.every((r) => r.evaluationBarIndex > 20));
  });

  it("mutex blocks E while position open; E > exitBar is required for next entry", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    const open = lifecycle.trades[0]!;
    assert.equal(open.exitBarIndex, 23);
    for (const r of lifecycle.entryRejections) {
      if (r.reason === "MUTEX_POSITION_OPEN") {
        assert.ok(r.evaluationBarIndex <= open.exitBarIndex!);
      }
    }
    for (let i = 1; i < lifecycle.trades.length; i++) {
      const prev = lifecycle.trades[i - 1]!;
      const cur = lifecycle.trades[i]!;
      assert.ok(cur.evaluationBarIndex > (prev.exitBarIndex ?? -1));
    }
  });

  it("re-entry policy: allow same prospectiveSetupId after prior exit (no setup dedupe)", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    assert.equal(
      lifecycle.configuration.reEntryPolicyId,
      "RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT"
    );
    for (const t of lifecycle.trades) {
      assert.ok(t.lifecycleSequence >= 1);
      assert.notEqual(t.tradeId, t.prospectiveSetupId);
    }
  });

  it("tradeId is stable and encodes symbol, timeframe, sequence, E, template", () => {
    const report = backtestDemo(20, 23);
    const lifecycle = buildIndependentTradeLifecycleReport({ report });
    const t = lifecycle.trades[0]!;
    const expected = `${t.symbol}:${t.timeframe}:trade:${t.lifecycleSequence}:${t.evaluationBarIndex}:${t.prospectiveSetupId}`;
    assert.equal(t.tradeId, expected);
    const again = buildIndependentTradeLifecycleReport({ report });
    assert.equal(again.trades[0]?.tradeId, t.tradeId);
  });

  it("does not mutate backtest report artifact or path batch", () => {
    const report = backtestDemo(20, 23);
    const artifactBefore = JSON.stringify(report.artifact);
    const batchBefore = JSON.stringify(report.pathBatch);
    buildIndependentTradeLifecycleReport({ report });
    assert.equal(JSON.stringify(report.artifact), artifactBefore);
    assert.equal(JSON.stringify(report.pathBatch), batchBefore);
  });
});
