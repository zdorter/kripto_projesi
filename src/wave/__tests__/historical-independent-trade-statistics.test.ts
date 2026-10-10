import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateIndependentTradeStatistics,
  computeIndependentTradeWinRateDecisive,
  emptyIndependentTradeStatisticsCounts,
  resolveIndependentTradeDirectionSliceKey,
} from "../historical-independent-trade-statistics";
import { HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION } from "../historical-independent-trade-statistics-types";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import {
  buildIndependentTradeLifecycleReport,
} from "../independent-trade-unit-lifecycle";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeLifecycleReport,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";

function assertCountInvariant(counts: {
  wins: number;
  losses: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
  totalTradeObservations: number;
}): void {
  const sum =
    counts.wins +
    counts.losses +
    counts.inconclusiveSameBar +
    counts.unresolvedAtHorizon +
    counts.unmeasuredNoFuture +
    counts.unmeasuredInsufficient;
  assert.equal(sum, counts.totalTradeObservations);
}

function baseLifecycle(
  trades: IndependentTradeUnit[],
  summaryPatch?: Partial<IndependentTradeLifecycleReport["summary"]>
): IndependentTradeLifecycleReport {
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
      totalSnapshots: 100,
      eligibleEntrySnapshots: trades.length,
      rejectedByMutex: 0,
      rejectedSiblingNotSelected: 0,
      rejectedPathUnmeasured: 0,
      independentTrades: trades.length,
      measuredTrades: trades.length,
      unmeasuredSnapshots: 0,
      overlappingSnapshotsEliminated: 0,
      firstEvaluationBar: trades[0]?.evaluationBarIndex ?? null,
      lastEvaluationBar:
        trades[trades.length - 1]?.evaluationBarIndex ?? null,
      minLifecycleDurationBars: null,
      maxLifecycleDurationBars: null,
      ...summaryPatch,
    },
    trades,
    entryRejections: [],
  };
}

function trade(
  patch: Partial<IndependentTradeUnit> & {
    pathOutcome: IndependentTradeUnit["pathOutcome"];
    policyClassification: IndependentTradeUnit["policyClassification"];
  }
): IndependentTradeUnit {
  const prospectiveSetupId =
    patch.prospectiveSetupId ??
    "BTCUSDT:1H:prospective:TEST_FAMILY:setup-1";
  const e = patch.evaluationBarIndex ?? 10;
  return {
    tradeId: patch.tradeId ?? `BTCUSDT:1H:trade:1:${e}:${prospectiveSetupId}`,
    lifecycleSequence: patch.lifecycleSequence ?? 1,
    snapshotId: patch.snapshotId ?? `BTCUSDT:1H:${e}:${prospectiveSetupId}`,
    symbol: patch.symbol ?? "BTCUSDT",
    timeframe: patch.timeframe ?? "1H",
    evaluationBarIndex: e,
    evaluationBarTime: patch.evaluationBarTime ?? null,
    prospectiveSetupId,
    sourceSetupId: patch.sourceSetupId ?? null,
    direction: patch.direction ?? "BULLISH",
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 110,
    invalidationReferencePrice: patch.invalidationReferencePrice ?? 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: patch.snapshotCohorts ?? [
      "ALL_PRODUCTION_CANDIDATES",
      "DISPLAY_PICK",
    ],
    setupFamilyId: patch.setupFamilyId ?? "TEST_FAMILY",
    tradeEvaluationStatus: patch.tradeEvaluationStatus ?? "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome,
    policyClassification: patch.policyClassification,
    lifecycleStatus: patch.lifecycleStatus ?? "OPEN_RESOLVED",
    exitBarIndex: patch.exitBarIndex ?? e + 3,
    resolutionBarIndex: patch.resolutionBarIndex ?? e + 3,
    barsAfterEvaluation: patch.barsAfterEvaluation ?? 3,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 3,
  };
}

describe("historical-independent-trade-statistics", () => {
  it("empty trade report", () => {
    const report = aggregateIndependentTradeStatistics(baseLifecycle([]));
    assert.equal(report.overall.counts.totalTrades, 0);
    assert.equal(report.overall.rates.winRate_decisive.value, null);
    assert.equal(report.snapshotReference.independentTrades, 0);
    assertCountInvariant(report.overall.counts);
  });

  it("one WIN trade", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    assert.equal(stats.overall.counts.wins, 1);
    assert.equal(stats.overall.counts.losses, 0);
    assert.equal(stats.overall.rates.winRate_decisive.value, 1);
    assertCountInvariant(stats.overall.counts);
  });

  it("one LOSS trade", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(stats.overall.counts.losses, 1);
    assert.equal(stats.overall.rates.winRate_decisive.value, 0);
  });

  it("WIN + LOSS → correct win rate", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          tradeId: "t1",
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "t2",
          evaluationBarIndex: 20,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(stats.overall.counts.decisiveResolutions, 2);
    assert.equal(stats.overall.rates.winRate_decisive.numerator, 1);
    assert.equal(stats.overall.rates.winRate_decisive.denominator, 2);
    assert.equal(stats.overall.rates.winRate_decisive.value, 0.5);
    assert.equal(
      stats.overall.rates.winRate_decisive.denominatorId,
      "DECISIVE_RESOLUTIONS"
    );
  });

  it("WIN + LOSS + AMBIGUOUS", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
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
        trade({
          tradeId: "t3",
          evaluationBarIndex: 12,
          pathOutcome: "AMBIGUOUS",
          policyClassification: "INCONCLUSIVE_SAME_BAR",
        }),
      ])
    );
    assert.equal(stats.overall.counts.inconclusiveSameBar, 1);
    assert.equal(stats.overall.rates.winRate_decisive.denominator, 2);
    assertCountInvariant(stats.overall.counts);
  });

  it("WIN + LOSS + NO_TOUCH", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
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
        trade({
          tradeId: "t3",
          evaluationBarIndex: 12,
          pathOutcome: "NO_TOUCH",
          policyClassification: "UNRESOLVED_AT_HORIZON",
          lifecycleStatus: "UNRESOLVED_AT_HORIZON_EXIT",
        }),
      ])
    );
    assert.equal(stats.overall.counts.unresolvedAtHorizon, 1);
    assert.equal(stats.overall.rates.winRate_decisive.denominator, 2);
  });

  it("UNMEASURED trade counts", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          pathOutcome: "NO_FUTURE_DATA",
          policyClassification: "UNMEASURED_NO_FUTURE",
          lifecycleStatus: "PATH_UNMEASURED",
          lifecycleDurationBars: null,
          exitBarIndex: null,
        }),
      ])
    );
    assert.equal(stats.overall.counts.unmeasuredNoFuture, 1);
    assert.equal(stats.overall.counts.measuredTrades, 0);
    assert.equal(stats.overall.rates.winRate_decisive.value, null);
    assertCountInvariant(stats.overall.counts);
  });

  it("zero decisive → winRate null", () => {
    const rate = computeIndependentTradeWinRateDecisive(0, 0);
    assert.equal(rate.value, null);
    assert.equal(rate.denominator, 0);
  });

  it("direction slices", () => {
    const unit = trade({
      direction: "BEARISH",
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    assert.equal(resolveIndependentTradeDirectionSliceKey(unit), "BEARISH");
    const stats = aggregateIndependentTradeStatistics(baseLifecycle([unit]));
    assert.equal(stats.byDirection.BEARISH.counts.wins, 1);
    assert.equal(stats.byDirection.BULLISH.counts.totalTrades, 0);
  });

  it("RR bucket slices without eligibility filter", () => {
    const lowRr = trade({
      canonicalRrRatio: 1.2,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const stats = aggregateIndependentTradeStatistics(baseLifecycle([lowRr]));
    assert.equal(stats.byRrBucket.FROM_1_0_TO_1_5.counts.totalTrades, 1);
    assert.equal(stats.byRrBucket.NULL_OR_INVALID_RR.counts.totalTrades, 0);
  });

  it("setup family and symbol/timeframe slices", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          setupFamilyId: "STRUCTURAL_RESUMPTION_CONTEXT",
          symbol: "ETHUSDT",
          timeframe: "4H",
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      stats.bySetupFamily.STRUCTURAL_RESUMPTION_CONTEXT.counts.wins,
      1
    );
    assert.equal(stats.bySymbol.ETHUSDT.counts.totalTrades, 1);
    assert.equal(stats.byTimeframe["4H"].counts.totalTrades, 1);
  });

  it("cohort overlap: sum of cohort totals may exceed global total", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          snapshotCohorts: [
            "ALL_PRODUCTION_CANDIDATES",
            "DISPLAY_PICK",
            "TRADE_EVAL_PASSED",
          ],
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.equal(stats.overall.counts.totalTrades, 1);
    const cohortSum = Object.values(stats.cohorts).reduce(
      (n, s) => n + s.counts.totalTrades,
      0
    );
    assert.ok(cohortSum > stats.overall.counts.totalTrades);
  });

  it("evaluation × outcome cross (FAILED+FAVORABLE, PASSED+ADVERSE)", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
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
      ])
    );
    assert.equal(
      stats.evaluationCross.FAILED.FAVORABLE_RESOLUTION,
      1
    );
    assert.equal(
      stats.evaluationCross.PASSED.ADVERSE_RESOLUTION,
      1
    );
    assert.equal(stats.overall.counts.wins, 1);
    assert.equal(stats.overall.counts.losses, 1);
  });

  it("exit reason distribution", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "t2",
          evaluationBarIndex: 11,
          pathOutcome: "NO_TOUCH",
          policyClassification: "UNRESOLVED_AT_HORIZON",
        }),
      ])
    );
    assert.equal(stats.pathOutcomeDistribution.TARGET_TOUCHED, 1);
    assert.equal(stats.pathOutcomeDistribution.NO_TOUCH, 1);
    const pathSum = Object.values(stats.pathOutcomeDistribution).reduce(
      (a, b) => a + b,
      0
    );
    assert.equal(pathSum, stats.overall.counts.totalTrades);
  });

  it("duration min/max/average/median", () => {
    const stats = aggregateIndependentTradeStatistics(
      baseLifecycle([
        trade({
          lifecycleDurationBars: 2,
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "t2",
          evaluationBarIndex: 11,
          lifecycleDurationBars: 8,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
        trade({
          tradeId: "t3",
          evaluationBarIndex: 12,
          lifecycleDurationBars: 4,
          pathOutcome: "NO_TOUCH",
          policyClassification: "UNRESOLVED_AT_HORIZON",
        }),
      ])
    );
    assert.equal(stats.duration.sampleCount, 3);
    assert.equal(stats.duration.minDurationBars, 2);
    assert.equal(stats.duration.maxDurationBars, 8);
    assert.equal(stats.duration.averageDurationBars, (2 + 8 + 4) / 3);
    assert.equal(stats.duration.medianDurationBars, 4);
  });

  it("deterministic repeated aggregation", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const a = aggregateIndependentTradeStatistics(lifecycle);
    const b = aggregateIndependentTradeStatistics(lifecycle);
    assert.deepEqual(a, b);
  });

  it("input lifecycle report immutability", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const before = JSON.stringify(lifecycle);
    aggregateIndependentTradeStatistics(lifecycle);
    assert.equal(JSON.stringify(lifecycle), before);
  });

  it("policyId and entryEventPolicyId preserved", () => {
    const stats = aggregateIndependentTradeStatistics(baseLifecycle([]));
    assert.equal(
      stats.policyId,
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
    );
    assert.equal(
      stats.entryEventPolicyId,
      ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT
    );
    assert.equal(
      stats.statisticsSchemaVersion,
      HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION
    );
  });

  it("B-12b trade count parity on DEMO lifecycle", () => {
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
    assert.equal(
      stats.overall.counts.totalTrades,
      lifecycle.trades.length
    );
    assert.equal(
      stats.snapshotReference.independentTrades,
      lifecycle.summary.independentTrades
    );
    for (const t of lifecycle.trades) {
      assert.ok(t.snapshotCohorts.length > 0);
      assert.ok(t.setupFamilyId.length > 0);
    }
  });

  it("architecture: statistics module does not rerun path/compose/PnL", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-independent-trade-statistics.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("aggregateIndependentTradeStatistics"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("resolveHistoricalPositionPathV1"));
    assert.ok(!mod.includes("composeProductionWaveScannerForSymbol"));
    assert.ok(!mod.includes("evaluateTradeEvaluation"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("calculatePnL"));
    assert.ok(!mod.includes("fetch("));
  });

  it("emptyIndependentTradeStatisticsCounts defaults", () => {
    const c = emptyIndependentTradeStatisticsCounts();
    assert.equal(c.totalTrades, 0);
    assert.equal(c.totalTradeObservations, 0);
  });
});
