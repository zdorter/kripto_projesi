import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeIndependentTradeStatistics,
  classifyHistoricalIndependentTradeSampleSize,
  emptyIndependentTradeAnalysisReport,
} from "../historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS } from "../historical-independent-trade-analysis-types";
import {
  aggregateIndependentTradeStatistics,
} from "../historical-independent-trade-statistics";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeLifecycleReport,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
function baseLifecycle(trades: IndependentTradeUnit[]): IndependentTradeLifecycleReport {
  return {
    schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
    configuration: {
      lifecycleSchemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
      entryEventPolicySchemaVersion: "1.0",
      siblingCandidatePolicyId:
        "SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID",
      reEntryPolicyId: "RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT",
      positionMutexPolicyId: "POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL",
      outcomePolicyId: POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
      horizonBars: 24,
    },
    summary: {
      totalSnapshots: 10,
      eligibleEntrySnapshots: trades.length,
      rejectedByMutex: 0,
      rejectedSiblingNotSelected: 0,
      rejectedPathUnmeasured: 0,
      independentTrades: trades.length,
      measuredTrades: trades.length,
      unmeasuredSnapshots: 0,
      overlappingSnapshotsEliminated: 0,
      firstEvaluationBar: null,
      lastEvaluationBar: null,
      minLifecycleDurationBars: null,
      maxLifecycleDurationBars: null,
    },
    trades,
    entryRejections: [],
  };
}

function trade(
  patch: Partial<IndependentTradeUnit> & {
    policyClassification: IndependentTradeUnit["policyClassification"];
    pathOutcome: IndependentTradeUnit["pathOutcome"];
  }
): IndependentTradeUnit {
  const prospectiveSetupId = patch.prospectiveSetupId ?? "BTCUSDT:1H:prospective:FAM:setup-1";
  const e = patch.evaluationBarIndex ?? 10;
  return {
    tradeId: patch.tradeId ?? `BTCUSDT:1H:trade:1:${e}:${prospectiveSetupId}`,
    lifecycleSequence: 1,
    snapshotId: `BTCUSDT:1H:${e}:${prospectiveSetupId}`,
    symbol: patch.symbol ?? "BTCUSDT",
    timeframe: patch.timeframe ?? "1H",
    evaluationBarIndex: e,
    evaluationBarTime: null,
    prospectiveSetupId,
    sourceSetupId: null,
    direction: patch.direction ?? "BULLISH",
    entryReferencePrice: 100,
    targetReferencePrice: 110,
    invalidationReferencePrice: 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: patch.snapshotCohorts ?? [
      "ALL_PRODUCTION_CANDIDATES",
      "DISPLAY_PICK",
    ],
    setupFamilyId: patch.setupFamilyId ?? "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus ?? "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome,
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: e + (patch.lifecycleDurationBars ?? 3),
    resolutionBarIndex: e + 3,
    barsAfterEvaluation: 3,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 3,
  };
}

describe("historical-independent-trade-analysis", () => {
  it("empty report", () => {
    const lifecycle = baseLifecycle([]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.overall.totalTrades, 0);
    assert.equal(analysis.overall.winRate_decisive.value, null);
  });

  it("overall parity with B-12c counts", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "t2",
        evaluationBarIndex: 11,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    assert.equal(analysis.population.wins, 1);
    assert.equal(analysis.population.losses, 1);
    assert.equal(analysis.population.decisiveResolutions, 2);
    assert.equal(analysis.population.winRate_decisive.value, 0.5);
  });

  it("direction analysis includes delta from overall", () => {
    const lifecycle = baseLifecycle([
      trade({
        direction: "BULLISH",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "t2",
        evaluationBarIndex: 11,
        direction: "BEARISH",
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.byDirection.BULLISH.wins, 1);
    assert.equal(analysis.byDirection.BEARISH.losses, 1);
    assert.ok(analysis.byDirection.BULLISH.winRateDeltaFromOverall !== null);
  });

  it("RR analysis retains low RR bucket without filtering", () => {
    const lifecycle = baseLifecycle([
      trade({
        canonicalRrRatio: 1.2,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.byRrBucket.FROM_1_0_TO_1_5.totalTrades, 1);
  });

  it("setup family analysis", () => {
    const lifecycle = baseLifecycle([
      trade({
        setupFamilyId: "ALPHA",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.bySetupFamily.ALPHA.wins, 1);
  });

  it("symbol and timeframe", () => {
    const lifecycle = baseLifecycle([
      trade({
        symbol: "ETHUSDT",
        timeframe: "4H",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.bySymbol.ETHUSDT.totalTrades, 1);
    assert.equal(analysis.byTimeframe["4H"].totalTrades, 1);
  });

  it("cohort overlap does not sum to global", () => {
    const lifecycle = baseLifecycle([
      trade({
        snapshotCohorts: [
          "ALL_PRODUCTION_CANDIDATES",
          "DISPLAY_PICK",
          "TRADE_EVAL_PASSED",
        ],
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    const cohortSum = Object.values(analysis.byCohort).reduce(
      (n, c) => n + c.totalTrades,
      0
    );
    assert.ok(cohortSum > analysis.overall.totalTrades);
  });

  it("evaluation and evaluation × outcome cross", () => {
    const lifecycle = baseLifecycle([
      trade({
        tradeEvaluationStatus: "FAILED",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "t2",
        evaluationBarIndex: 11,
        tradeEvaluationStatus: "PASSED",
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.byEvaluation.FAILED.wins, 1);
    assert.equal(analysis.byEvaluation.PASSED.losses, 1);
    const cross = analysis.evaluationOutcomeCross;
    assert.ok(
      cross.some(
        (c) =>
          c.evaluationStatus === "FAILED" &&
          c.policyClassification === "FAVORABLE_RESOLUTION"
      )
    );
  });

  it("exit reason distribution", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "NO_TOUCH",
        policyClassification: "UNRESOLVED_AT_HORIZON",
        lifecycleStatus: "UNRESOLVED_AT_HORIZON_EXIT",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    const row = analysis.byExitReason.find((r) => r.pathOutcome === "NO_TOUCH");
    assert.equal(row?.count, 1);
    assert.equal(row?.percentageOfTrades, 1);
  });

  it("duration buckets from lifecycle", () => {
    const lifecycle = baseLifecycle([
      trade({
        lifecycleDurationBars: 2,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "t2",
        evaluationBarIndex: 11,
        lifecycleDurationBars: 10,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    assert.equal(analysis.byDurationBucket.DURATION_1_3.wins, 1);
    assert.equal(analysis.byDurationBucket.DURATION_7_12.losses, 1);
  });

  it("combined direction × RR", () => {
    const lifecycle = baseLifecycle([
      trade({
        direction: "BULLISH",
        canonicalRrRatio: 2.5,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    assert.ok(
      Object.keys(analysis.combined.directionByRrBucket).some((k) =>
        k.includes("BULLISH")
      )
    );
  });

  it("sample quality thresholds", () => {
    assert.equal(classifyHistoricalIndependentTradeSampleSize(5), "VERY_SMALL_SAMPLE");
    assert.equal(classifyHistoricalIndependentTradeSampleSize(10), "SMALL_SAMPLE");
    assert.equal(classifyHistoricalIndependentTradeSampleSize(30), "MODERATE_SAMPLE");
    assert.equal(classifyHistoricalIndependentTradeSampleSize(100), "LARGE_SAMPLE");
    assert.equal(
      INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS.actionableDecisiveMin,
      30
    );
  });

  it("small sample flagged on highest observed", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    const top = analysis.highestObservedWinRates[0];
    assert.ok(top);
    assert.equal(top.sampleSizeQuality, "VERY_SMALL_SAMPLE");
    assert.ok(top.note.includes("small"));
  });

  it("zero decisive → null win rate", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "AMBIGUOUS",
        policyClassification: "INCONCLUSIVE_SAME_BAR",
        lifecycleStatus: "AMBIGUOUS_EXIT",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(analysis.overall.winRate_decisive.value, null);
  });

  it("deterministic repeated analysis", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const a = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    const b = analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.deepEqual(a, b);
  });

  it("immutability of statistics input", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const before = JSON.stringify(stats);
    analyzeIndependentTradeStatistics({ statisticsReport: stats });
    assert.equal(JSON.stringify(stats), before);
  });

  it("emptyIndependentTradeAnalysisReport", () => {
    const lifecycle = baseLifecycle([]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const analysis = emptyIndependentTradeAnalysisReport(stats);
    assert.equal(analysis.overall.totalTrades, 0);
  });

  it("B-12c parity on DEMO pipeline", () => {
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
    assert.equal(
      analysis.population.wins,
      stats.overall.counts.wins
    );
    assert.equal(
      analysis.overall.totalTrades,
      lifecycle.trades.length
    );
  });

  it("architecture: no path/PnL in analysis module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-independent-trade-analysis.ts"),
      "utf8"
    );
    assert.ok(mod.includes("analyzeIndependentTradeStatistics"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("aggregateIndependentTradeStatistics"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("calculatePnL"));
    assert.ok(!mod.includes("fetch("));
  });
});
