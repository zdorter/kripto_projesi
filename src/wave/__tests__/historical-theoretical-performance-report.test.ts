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
import { validateIndependentTradeStatistics } from "../historical-independent-trade-statistical-validation";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { buildHistoricalTheoreticalPerformanceReport } from "../historical-theoretical-performance-report";
import { HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION } from "../historical-theoretical-performance-report-types";
import { THEORETICAL_PERFORMANCE_EXPECTANCY_TOLERANCE } from "../historical-theoretical-performance-report-types";
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
    tradeId: patch.tradeId ?? `t-${e}`,
    lifecycleSequence: 1,
    snapshotId: patch.snapshotId ?? `snap-${e}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    evaluationBarIndex: e,
    evaluationBarTime: null,
    prospectiveSetupId: "BTCUSDT:1H:prospective:FAM:setup",
    sourceSetupId: null,
    direction: patch.direction ?? "BULLISH",
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 110,
    invalidationReferencePrice: patch.invalidationReferencePrice ?? 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
    setupFamilyId: patch.setupFamilyId ?? "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus ?? "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome,
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 13,
    resolutionBarIndex: 13,
    barsAfterEvaluation: 3,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 3,
  };
}

function buildReport(lifecycle: IndependentTradeLifecycleReport) {
  const stats = aggregateIndependentTradeStatistics(lifecycle);
  const rStats = aggregateIndependentTradeRMultipleStatistics({
    lifecycleReport: lifecycle,
    statisticsReport: stats,
  });
  const audit = auditIndependentTradeTheoreticalREligibility({
    lifecycleReport: lifecycle,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
  });
  return buildHistoricalTheoreticalPerformanceReport({
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
    eligibilityAuditReport: audit,
    lifecycleReport: lifecycle,
  });
}

describe("historical-theoretical-performance-report", () => {
  it("A–E overall parity with B-12g/B-12c", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "b",
        evaluationBarIndex: 11,
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 98,
        invalidationReferencePrice: 95,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    const report = buildHistoricalTheoreticalPerformanceReport({
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
      eligibilityAuditReport: audit,
    });
    assert.equal(report.overall.wins, stats.overall.counts.wins);
    assert.equal(report.overall.losses, stats.overall.counts.losses);
    assert.equal(report.overall.decisiveTrades, 2);
    assert.equal(report.overall.validTheoreticalRTrades, 1);
    assert.equal(report.overall.decisiveWithoutTheoreticalR, 1);
    assert.equal(report.overall.sumR, rStats.overall.sumR);
  });

  it("F. expectancy formula consistent with B-12g", () => {
    const report = buildReport(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "l",
          evaluationBarIndex: 11,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(report.overall.expectancyValidation, "CONSISTENT");
    assert.ok(
      Math.abs(report.overall.expectancyValidationDelta ?? 0) <=
        THEORETICAL_PERFORMANCE_EXPECTANCY_TOLERANCE
    );
  });

  it("G–I profit factor and loss R invariant", () => {
    const report = buildReport(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "l",
          evaluationBarIndex: 11,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(report.overall.profitFactorR, 2);
    assert.equal(report.lossAnalysis.lossRInvariantHolds, true);
  });

  it("J. break-even win rate", () => {
    const report = buildReport(
      baseLifecycle([
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
      ])
    );
    assert.ok(report.breakEven.breakEvenWinRate !== null);
    assert.ok(report.breakEven.edgeOverBreakEven !== null);
  });

  it("K–P dimension slices present", () => {
    const report = buildReport(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
          tradeEvaluationStatus: "FAILED",
        }),
      ])
    );
    assert.ok(report.byDirection.BULLISH.decisive >= 1);
    assert.ok(report.byRrBucket.FROM_1_5_TO_2_0.decisive >= 0);
    assert.ok(report.byEvaluation.FAILED.decisive >= 1);
    assert.ok(report.bySetupFamily.FAM.decisive >= 1);
    assert.ok(report.byExitReason.length >= 4);
    assert.ok(report.byDuration.DURATION_1_3.decisive >= 0);
    assert.ok(report.byCohort.DISPLAY_PICK.decisive >= 1);
  });

  it("Q. cohort overlap allowed", () => {
    const report = buildReport(
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
    const cohortDecisive = Object.values(report.byCohort).reduce(
      (n, s) => n + s.decisive,
      0
    );
    assert.ok(cohortDecisive > report.overall.decisiveTrades);
  });

  it("R. prospective vs theoretical R distinction", () => {
    const report = buildReport(baseLifecycle([]));
    assert.ok(
      report.prospectiveVsTheoreticalR.note.includes("prospective") ||
        report.prospectiveVsTheoreticalR.prospectiveRrSource.includes("B-9d")
    );
    assert.ok(report.warnings.prospectiveRrIsNotRealizedR.length > 0);
  });

  it("S. invalid geometry does not change WIN/LOSS counts", () => {
    const lifecycle = baseLifecycle([
      trade({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 98,
        invalidationReferencePrice: 95,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const report = buildReport(lifecycle);
    assert.equal(report.overall.wins, 1);
    assert.equal(report.overall.losses, 0);
    assert.equal(stats.overall.counts.wins, 1);
  });

  it("T. deterministic", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const a = buildReport(lifecycle);
    const b = buildReport(lifecycle);
    assert.deepEqual(a, b);
  });

  it("U. immutable inputs", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    const before = JSON.stringify({ lifecycle, stats, rStats, audit });
    buildHistoricalTheoreticalPerformanceReport({
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
      eligibilityAuditReport: audit,
      lifecycleReport: lifecycle,
    });
    assert.equal(JSON.stringify({ lifecycle, stats, rStats, audit }), before);
  });

  it("V. warnings", () => {
    const report = buildReport(baseLifecycle([]));
    assert.ok(report.warnings.notRealMoney.length > 0);
    assert.ok(report.warnings.noFees.length > 0);
  });

  it("W. sample quality on slice", () => {
    const report = buildReport(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      report.byDirection.BULLISH.sampleSizeQuality,
      "VERY_SMALL_SAMPLE"
    );
    assert.equal(report.byDirection.BULLISH.interpretWithCaution, true);
  });

  it("M. parity invariant", () => {
    const report = buildReport(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "l",
          evaluationBarIndex: 11,
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      report.overall.validTheoreticalRTrades +
        report.overall.decisiveWithoutTheoreticalR,
      report.overall.decisiveTrades
    );
  });

  it("schema version", () => {
    const report = buildReport(baseLifecycle([]));
    assert.equal(
      report.schemaVersion,
      HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION
    );
  });

  it("real BTC pipeline report", async () => {
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
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    const validation = validateIndependentTradeStatistics({
      statisticsReport: stats,
    });
    const report = buildHistoricalTheoreticalPerformanceReport({
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
      eligibilityAuditReport: audit,
      lifecycleReport: lifecycle,
      validationReport: validation,
    });
    assert.equal(report.overall.totalTrades, lifecycle.trades.length);
    assert.equal(
      report.overall.validTheoreticalRTrades +
        report.overall.decisiveWithoutTheoreticalR,
      report.overall.decisiveTrades
    );
    assert.equal(report.overall.sumR, rStats.overall.sumR);
    assert.equal(report.overall.expectancyR, rStats.overall.expectancyR);
    if (
      lifecycle.summary.independentTrades === 340 &&
      stats.overall.counts.decisiveResolutions === 285
    ) {
      assert.equal(stats.overall.counts.wins, 131);
      assert.equal(stats.overall.counts.losses, 154);
      assert.equal(report.overall.validTheoreticalRTrades, 269);
      assert.equal(report.overall.decisiveWithoutTheoreticalR, 16);
      assert.ok(report.invalidGeometryImpact.percentageUnavailable! > 0.05);
    }
    assert.ok(report.statisticalContext !== null);
  });

  it("architecture: consume only, no backtest/path/PnL", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-theoretical-performance-report.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalTheoreticalPerformanceReport"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("runRealHistoricalBacktest"));
    assert.ok(!mod.includes("aggregateIndependentTradeRMultipleStatistics"));
    assert.ok(!mod.includes("auditIndependentTradeTheoreticalREligibility"));
    assert.ok(!mod.includes("computeTheoreticalTradeRMultiple"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!mod.includes("calculatePnL"));
  });
});
