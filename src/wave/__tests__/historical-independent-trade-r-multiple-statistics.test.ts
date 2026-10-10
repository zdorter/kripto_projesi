import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../historical-ohlcv-dataset-loader";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import {
  aggregateIndependentTradeRMultipleStatistics,
  computeTheoreticalTradeRMultiple,
} from "../historical-independent-trade-r-multiple-statistics";
import { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION } from "../historical-independent-trade-r-multiple-statistics-types";
import { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "../historical-independent-trade-r-multiple-contract";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeLifecycleReport,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";
import {
  resolveRealHistoricalBacktestEvaluationRange,
  runRealHistoricalBacktest,
} from "../real-historical-backtest";

function baseLifecycle(
  trades: IndependentTradeUnit[]
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
      totalSnapshots: trades.length,
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
    pathOutcome: IndependentTradeUnit["pathOutcome"];
    policyClassification: IndependentTradeUnit["policyClassification"];
  }
): IndependentTradeUnit {
  const e = patch.evaluationBarIndex ?? 10;
  return {
    tradeId: patch.tradeId ?? "t1",
    lifecycleSequence: 1,
    snapshotId: patch.snapshotId ?? "snap:t1",
    symbol: patch.symbol ?? "BTCUSDT",
    timeframe: patch.timeframe ?? "1H",
    evaluationBarIndex: e,
    evaluationBarTime: null,
    prospectiveSetupId: "BTCUSDT:1H:prospective:FAM:setup",
    sourceSetupId: null,
    direction: patch.direction ?? "BULLISH",
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 110,
    invalidationReferencePrice: patch.invalidationReferencePrice ?? 95,
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
    lifecycleStatus: patch.lifecycleStatus ?? "OPEN_RESOLVED",
    exitBarIndex: 13,
    resolutionBarIndex: 13,
    barsAfterEvaluation: 3,
    lifecycleDurationBars: 3,
  };
}

describe("historical-independent-trade-r-multiple-statistics", () => {
  it("A. BULLISH WIN → +target R", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, 2);
    assert.equal(r.prospectiveRrRatio, 2);
  });

  it("B. BULLISH LOSS → -1R", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, -1);
  });

  it("C. BEARISH WIN → +target R", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        direction: "BEARISH",
        entryReferencePrice: 100,
        targetReferencePrice: 90,
        invalidationReferencePrice: 105,
        canonicalRrRatio: 2,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, 2);
  });

  it("D. BEARISH LOSS → -1R", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        direction: "BEARISH",
        entryReferencePrice: 100,
        targetReferencePrice: 90,
        invalidationReferencePrice: 105,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, -1);
  });

  it("E–H. non-decisive path outcomes → no R", () => {
    for (const [outcome, policy] of [
      ["AMBIGUOUS", "INCONCLUSIVE_SAME_BAR"],
      ["NO_TOUCH", "UNRESOLVED_AT_HORIZON"],
      ["NO_FUTURE_DATA", "UNMEASURED_NO_FUTURE"],
      ["INSUFFICIENT_CONTEXT", "UNMEASURED_INSUFFICIENT"],
    ] as const) {
      const r = computeTheoreticalTradeRMultiple(
        trade({ pathOutcome: outcome, policyClassification: policy })
      );
      assert.equal(r.theoreticalR, null);
    }
  });

  it("I. invalid risk", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 105,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, null);
    assert.ok(
      r.rejectionReasons.includes("INVALID_RISK_REFERENCE") ||
        r.rejectionReasons.includes("INCONSISTENT_TARGET_DIRECTION")
    );
  });

  it("J. invalid direction", () => {
    const r = computeTheoreticalTradeRMultiple({
      ...trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      direction: null,
    });
    assert.equal(r.theoreticalR, null);
    assert.ok(r.rejectionReasons.includes("INVALID_DIRECTION"));
  });

  it("K. inconsistent target geometry", () => {
    const r = computeTheoreticalTradeRMultiple(
      trade({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 98,
        invalidationReferencePrice: 95,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      })
    );
    assert.equal(r.theoreticalR, null);
    assert.ok(r.rejectionReasons.includes("INCONSISTENT_TARGET_DIRECTION"));
  });

  it("L. zero decisive → null expectancy", () => {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([
        trade({
          pathOutcome: "NO_TOUCH",
          policyClassification: "UNRESOLVED_AT_HORIZON",
        }),
      ]),
    });
    assert.equal(report.overall.decisiveTrades, 0);
    assert.equal(report.overall.expectancyR, null);
    assert.equal(report.overall.averageWinR, null);
    assert.equal(report.overall.averageLossR, null);
    assert.equal(report.overall.profitFactorR, null);
  });

  it("M. zero wins", () => {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([
        trade({
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ]),
    });
    assert.equal(report.overall.wins, 0);
    assert.equal(report.overall.averageWinR, null);
    assert.equal(report.overall.averageLossR, -1);
  });

  it("N. zero losses → profit factor null", () => {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
    });
    assert.equal(report.overall.losses, 0);
    assert.equal(report.overall.averageLossR, null);
    assert.equal(report.overall.profitFactorR, null);
  });

  it("O. expectancy formula identity", () => {
    const lifecycle = baseLifecycle([
      trade({
        tradeId: "w",
        entryReferencePrice: 100,
        targetReferencePrice: 120,
        invalidationReferencePrice: 90,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "l",
        evaluationBarIndex: 11,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    const exp = report.overall.expectancyR!;
    const comp = report.overall.expectancyRFromWinLossComponents!;
    assert.ok(Math.abs(exp - comp) < 1e-12);
    assert.equal(exp, (2 + -1) / 2);
  });

  it("P. profit factor on mixed R", () => {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([
        trade({
          entryReferencePrice: 100,
          targetReferencePrice: 110,
          invalidationReferencePrice: 95,
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "l",
          evaluationBarIndex: 11,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ]),
    });
    assert.equal(report.overall.profitFactorR, 2);
  });

  it("Q. prospective RR ≠ realized theoretical R", () => {
    const unit = trade({
      canonicalRrRatio: 3,
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const r = computeTheoreticalTradeRMultiple(unit);
    assert.equal(r.prospectiveRrRatio, 3);
    assert.equal(r.theoreticalR, 2);
    assert.ok(reportHasDistinctionNote());
  });

  function reportHasDistinctionNote(): boolean {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
    });
    return report.prospectiveVsRealizedRNote.includes("prospective");
  }

  it("R–T. direction, RR bucket, evaluator slices", () => {
    const lifecycle = baseLifecycle([
      trade({
        direction: "BEARISH",
        entryReferencePrice: 100,
        targetReferencePrice: 90,
        invalidationReferencePrice: 105,
        canonicalRrRatio: 0.8,
        tradeEvaluationStatus: "FAILED",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    assert.equal(report.byDirection.BEARISH.decisive, 1);
    assert.equal(report.byRrBucket.LT_1_0.decisive, 1);
    assert.equal(report.byEvaluation.FAILED.decisive, 1);
    assert.equal(report.byEvaluation.FAILED.expectancyR, 2);
  });

  it("U. deterministic aggregation", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const a = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    const b = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    assert.deepEqual(a, b);
  });

  it("V. input immutability", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const before = JSON.stringify(lifecycle);
    aggregateIndependentTradeRMultipleStatistics({ lifecycleReport: lifecycle });
    assert.equal(JSON.stringify(lifecycle), before);
  });

  it("W. cohort overlap sums may exceed overall decisive", () => {
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
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    const cohortDecisive = Object.values(report.byCohort).reduce(
      (n, s) => n + s.decisive,
      0
    );
    assert.ok(cohortDecisive > report.overall.decisiveTrades);
  });

  it("schema and contract version", () => {
    const report = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: baseLifecycle([]),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION
    );
    assert.equal(
      report.rMultipleContractVersion,
      HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION
    );
  });

  it("pipeline parity with B-12c on DEMO slice", () => {
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
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    assert.equal(
      rStats.overall.decisiveTrades,
      stats.overall.counts.decisiveResolutions
    );
    assert.equal(rStats.overall.wins, stats.overall.counts.wins);
    assert.equal(rStats.overall.losses, stats.overall.counts.losses);
    assert.ok(
      rStats.overall.tradesWithTheoreticalR <= rStats.overall.decisiveTrades
    );
  });

  it("real BTCUSDT 1H theoretical R population parity (B-12c locks)", async () => {
    const candles = await fetchBinanceFuturesHistoricalCandles(
      "BTCUSDT",
      "1H",
      REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES
    );
    const range = resolveRealHistoricalBacktestEvaluationRange(
      candles.length,
      24
    );
    const result = runRealHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles,
      horizonBars: 24,
      startEvaluationBar: range.startEvaluationBar,
      endEvaluationBar: range.endEvaluationBar,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycle = buildIndependentTradeLifecycleReport({
      report: result.report,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    });
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    assert.equal(rStats.overall.totalTrades, lifecycle.summary.independentTrades);
    assert.equal(
      rStats.overall.decisiveTrades,
      stats.overall.counts.decisiveResolutions
    );
    assert.equal(rStats.overall.wins, stats.overall.counts.wins);
    assert.equal(rStats.overall.losses, stats.overall.counts.losses);
    assert.ok(
      rStats.overall.tradesWithTheoreticalR <= rStats.overall.decisiveTrades
    );
    assert.equal(
      rStats.overall.wins + rStats.overall.losses,
      rStats.overall.decisiveTrades
    );
    assert.ok(rStats.overall.expectancyR !== null);
    assert.ok(Number.isFinite(rStats.overall.sumR));
    assert.equal(
      rStats.overall.winRateDecisive.value,
      stats.overall.rates.winRate_decisive.value
    );
    const comp = rStats.overall.expectancyRFromWinLossComponents!;
    assert.ok(Math.abs(rStats.overall.expectancyR! - comp) < 1e-12);

    // B-12c canonical population (frozen dataset moment); skip strict locks if live klines drift.
    if (
      lifecycle.summary.independentTrades === 340 &&
      stats.overall.counts.decisiveResolutions === 285
    ) {
      assert.equal(stats.overall.counts.wins, 131);
      assert.equal(stats.overall.counts.losses, 154);
      assert.equal(stats.overall.counts.inconclusiveSameBar, 8);
      assert.equal(stats.overall.counts.unresolvedAtHorizon, 47);
      assert.equal(rStats.byEvaluation.PASSED.decisive, 122);
      assert.equal(rStats.byEvaluation.FAILED.decisive, 163);
    }
  });

  it("architecture: no path/evaluator/PnL", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-independent-trade-r-multiple-statistics.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("aggregateIndependentTradeRMultipleStatistics"));
    assert.ok(!mod.includes("evaluateTradeEvaluation"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("composeProductionWaveScannerForSymbol"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("calculatePnL"));
    assert.ok(!mod.includes("realizedPnl"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!mod.includes("optimize("));
  });
});
