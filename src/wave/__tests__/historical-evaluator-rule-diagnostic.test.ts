import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../historical-ohlcv-dataset-loader";
import { buildHistoricalEntryReferenceQualityAnalysis } from "../historical-entry-reference-quality-analysis";
import { analyzeIndependentTradeEvaluatorDiagnostic } from "../historical-independent-trade-evaluator-diagnostic";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { buildHistoricalEvaluatorRuleDiagnostic } from "../historical-evaluator-rule-diagnostic";
import { HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION } from "../historical-evaluator-rule-diagnostic-types";
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
import { HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION } from "../historical-independent-trade-statistics-types";
import { HISTORICAL_MEASUREMENT_COHORTS } from "../setup/historical-measurement-contract";

function btcStatisticsFixture() {
  const evaluationCross = {
    PASSED: {
      FAVORABLE_RESOLUTION: 33,
      ADVERSE_RESOLUTION: 89,
      INCONCLUSIVE_SAME_BAR: 0,
      UNRESOLVED_AT_HORIZON: 21,
      UNMEASURED_NO_FUTURE: 0,
      UNMEASURED_INSUFFICIENT: 0,
    },
    FAILED: {
      FAVORABLE_RESOLUTION: 98,
      ADVERSE_RESOLUTION: 65,
      INCONCLUSIVE_SAME_BAR: 8,
      UNRESOLVED_AT_HORIZON: 26,
      UNMEASURED_NO_FUTURE: 0,
      UNMEASURED_INSUFFICIENT: 0,
    },
    INSUFFICIENT_CONTEXT: {
      FAVORABLE_RESOLUTION: 0,
      ADVERSE_RESOLUTION: 0,
      INCONCLUSIVE_SAME_BAR: 0,
      UNRESOLVED_AT_HORIZON: 0,
      UNMEASURED_NO_FUTURE: 0,
      UNMEASURED_INSUFFICIENT: 0,
    },
  };
  return {
    statisticsSchemaVersion: HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION,
    policyId: POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    snapshotReference: {
      totalSnapshots: 18990,
      eligibleEntrySnapshots: 2951,
      independentTrades: 340,
      measuredTrades: 340,
      unmeasuredSnapshots: 0,
      rejectedByMutex: 2611,
      overlappingSnapshotsEliminated: 2611,
    },
    overall: {
      counts: {
        totalTrades: 340,
        measuredTrades: 340,
        unmeasuredTrades: 0,
        favorableResolutions: 131,
        adverseResolutions: 154,
        wins: 131,
        losses: 154,
        decisiveResolutions: 285,
        inconclusiveSameBar: 8,
        unresolvedAtHorizon: 47,
        unmeasuredNoFuture: 0,
        unmeasuredInsufficient: 0,
        measuredNonDecisive: 55,
        totalTradeObservations: 340,
      },
      denominators: {
        filteredTrades: 340,
        measuredTrades: 340,
        unmeasuredTrades: 0,
        decisiveResolutions: 285,
        measuredNonDecisive: 55,
      },
      classification: {
        FAVORABLE_RESOLUTION: 131,
        ADVERSE_RESOLUTION: 154,
        INCONCLUSIVE_SAME_BAR: 8,
        UNRESOLVED_AT_HORIZON: 47,
        UNMEASURED_NO_FUTURE: 0,
        UNMEASURED_INSUFFICIENT: 0,
      },
      rates: {
        winRate_decisive: {
          numerator: 131,
          denominator: 285,
          value: 131 / 285,
          denominatorId: "DECISIVE_RESOLUTIONS" as const,
        },
      },
    },
    evaluationCross,
    pathOutcomeDistribution: {
      NO_FUTURE_DATA: 0,
      NO_TOUCH: 47,
      TARGET_TOUCHED: 131,
      INVALIDATION_TOUCHED: 154,
      AMBIGUOUS: 8,
      INSUFFICIENT_CONTEXT: 0,
    },
    duration: {
      sampleCount: 340,
      minDurationBars: 1,
      maxDurationBars: 24,
      averageDurationBars: 8,
      medianDurationBars: 7,
    },
    cohorts: Object.fromEntries(
      HISTORICAL_MEASUREMENT_COHORTS.map((c) => [
        c,
        {
          counts: { totalTrades: 0, decisiveResolutions: 0, wins: 0, losses: 0 },
        },
      ])
    ),
    bySymbol: {},
    byTimeframe: {},
    bySetupFamily: {},
    byDirection: {},
    byRrBucket: {},
  } as import("../historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
}

function emptyLifecycle(): IndependentTradeLifecycleReport {
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
      totalSnapshots: 0,
      eligibleEntrySnapshots: 0,
      rejectedByMutex: 0,
      rejectedSiblingNotSelected: 0,
      rejectedPathUnmeasured: 0,
      independentTrades: 0,
      measuredTrades: 0,
      unmeasuredSnapshots: 0,
      overlappingSnapshotsEliminated: 0,
      firstEvaluationBar: null,
      lastEvaluationBar: null,
      minLifecycleDurationBars: null,
      maxLifecycleDurationBars: null,
    },
    trades: [],
    entryRejections: [],
  };
}

function unit(
  patch: Partial<IndependentTradeUnit> & {
    tradeEvaluationStatus: string;
    policyClassification: IndependentTradeUnit["policyClassification"];
  }
): IndependentTradeUnit {
  const id = patch.tradeId ?? "t1";
  return {
    tradeId: id,
    lifecycleSequence: 1,
    snapshotId: `snap:${id}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    evaluationBarIndex: 10,
    evaluationBarTime: null,
    prospectiveSetupId: "BTCUSDT:1H:prospective:FAM:setup",
    sourceSetupId: null,
    direction: patch.direction ?? "BULLISH",
    entryReferencePrice: 100,
    targetReferencePrice: 110,
    invalidationReferencePrice: 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: ["ALL_PRODUCTION_CANDIDATES"],
    setupFamilyId: patch.setupFamilyId ?? "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus,
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome ?? "TARGET_TOUCHED",
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 12,
    resolutionBarIndex: 12,
    barsAfterEvaluation: 2,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 2,
  };
}

describe("historical-evaluator-rule-diagnostic", () => {
  it("A. schema", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION
    );
  });

  it("B. PASSED/FAILED parity with B-12f", () => {
    const stats = btcStatisticsFixture();
    const b12f = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: stats,
      lifecycleReport: emptyLifecycle(),
    });
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: stats,
      evaluatorDiagnosticReport: b12f,
    });
    assert.equal(report.statusAnalysis.PASSED.wins, 33);
    assert.equal(report.statusAnalysis.PASSED.losses, 89);
    assert.equal(report.statusAnalysis.PASSED.decisiveTrades, 122);
    assert.equal(report.statusAnalysis.FAILED.wins, 98);
    assert.equal(report.statusAnalysis.FAILED.losses, 65);
    assert.equal(report.statusAnalysis.FAILED.decisiveTrades, 163);
    assert.equal(report.mismatchAnalysis.passedWins, 33);
    assert.equal(report.mismatchAnalysis.failedWins, 98);
    const diff = report.mismatchAnalysis.winRateDifferencePercentagePoints!;
    assert.ok(Math.abs(diff - -33.07) < 0.1);
  });

  it("C. failure reason unavailable without lifecycleReport", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(report.failureReasonAnalysis.available, false);
    assert.ok(
      report.failureReasonAnalysis.canonicalNote.includes("evaluatorFirstFailure")
    );
    assert.equal(report.failedWinFailureReasonAnalysis.available, false);
  });

  it("C2. failure reason available with lifecycleReport (B-12m)", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(report.failureReasonAnalysis.available, true);
    assert.equal(report.failedWinFailureReasonAnalysis.available, true);
    if (report.failureReasonAnalysis.available) {
      assert.equal(
        report.consumedReports.failureReasonSchemaVersion,
        report.failureReasonAnalysis.sourceSchemaVersion
      );
    }
  });

  it("D. RR × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeId: "p",
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
          canonicalRrRatio: 2,
        }),
        unit({
          tradeId: "f",
          tradeEvaluationStatus: "FAILED",
          policyClassification: "ADVERSE_RESOLUTION",
          canonicalRrRatio: 2,
          pathOutcome: "INVALIDATION_TOUCHED",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    const row = report.rrAnalysis.find(
      (r) => r.prospectiveRrBucket === "FROM_2_0_TO_3_0"
    );
    assert.ok(row);
    assert.equal(row!.passed.decisive, 1);
    assert.equal(row!.failed.decisive, 1);
  });

  it("E. direction × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
          direction: "BEARISH",
          entryReferencePrice: 100,
          targetReferencePrice: 90,
          invalidationReferencePrice: 105,
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    const bear = report.directionAnalysis.find((d) => d.direction === "BEARISH");
    assert.equal(bear!.passed.decisive, 1);
  });

  it("F. family × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "FAILED",
          policyClassification: "FAVORABLE_RESOLUTION",
          setupFamilyId: "CUSTOM_FAM",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    assert.ok(
      report.setupFamilyAnalysis.some((f) => f.setupFamilyId === "CUSTOM_FAM")
    );
  });

  it("G. geometry × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    assert.ok(
      report.geometryAnalysis.some(
        (g) => g.geometry === "CONSISTENT_GEOMETRY" && g.passed.total >= 1
      )
    );
  });

  it("H. exit × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
          pathOutcome: "TARGET_TOUCHED",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    const row = report.exitReasonAnalysis.find(
      (e) => e.pathOutcome === "TARGET_TOUCHED"
    );
    assert.equal(row!.passed.count, 1);
  });

  it("I. duration × evaluator", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "FAILED",
          policyClassification: "ADVERSE_RESOLUTION",
          lifecycleDurationBars: 5,
          pathOutcome: "INVALIDATION_TOUCHED",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    const d = report.durationAnalysis.find(
      (x) => x.durationBucket === "DURATION_4_6"
    );
    assert.equal(d!.failed.decisive, 1);
  });

  it("J. theoretical R consumption", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ],
    };
    const stats = aggregateIndependentTradeStatistics(lifecycle);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    assert.equal(report.theoreticalRAnalysis.available, true);
    assert.ok(report.theoreticalRAnalysis.passed);
  });

  it("K. prospective RR vs theoretical R separation", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    });
    assert.ok(
      report.prospectiveVsTheoreticalR.prospectiveRrSource.includes("B-9d")
    );
    assert.ok(
      report.prospectiveVsTheoreticalR.evaluatorDiagnosticsRrNote.includes(
        "not frozen"
      )
    );
  });

  it("L–O. mismatch quadrants", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeId: "pw",
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        unit({
          tradeId: "pl",
          tradeEvaluationStatus: "PASSED",
          policyClassification: "ADVERSE_RESOLUTION",
          pathOutcome: "INVALIDATION_TOUCHED",
        }),
        unit({
          tradeId: "fw",
          tradeEvaluationStatus: "FAILED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        unit({
          tradeId: "fl",
          tradeEvaluationStatus: "FAILED",
          policyClassification: "ADVERSE_RESOLUTION",
          pathOutcome: "INVALIDATION_TOUCHED",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    const byQ = Object.fromEntries(
      report.quadrantProfiles.map((q) => [q.quadrant, q.count])
    );
    assert.equal(byQ.PASSED_WIN, 1);
    assert.equal(byQ.PASSED_LOSS, 1);
    assert.equal(byQ.FAILED_WIN, 1);
    assert.equal(byQ.FAILED_LOSS, 1);
  });

  it("P. conditional cross-tabs", () => {
    const lifecycle = {
      ...emptyLifecycle(),
      trades: [
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
          direction: "BULLISH",
        }),
      ],
    };
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(
      report.conditionalAnalysis.passedDirectionOutcome.BULLISH.wins,
      1
    );
  });

  it("Q. field audit", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    });
    assert.ok(
      report.fieldAudit.some(
        (f) => f.field === "tradeEvaluationStatus" && f.usedInB12k
      )
    );
    assert.ok(
      report.fieldAudit.some(
        (f) =>
          f.field === "evaluatorFirstFailure" &&
          f.frozenInIndependentTradeUnit &&
          f.usedInB12k
      )
    );
  });

  it("R. sample-size quality on status row", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(
      report.statusAnalysis.PASSED.sampleSizeQuality,
      "LARGE_SAMPLE"
    );
  });

  it("S. deterministic", () => {
    const input = {
      lifecycleReport: emptyLifecycle(),
      statisticsReport: btcStatisticsFixture(),
    };
    const a = buildHistoricalEvaluatorRuleDiagnostic(input);
    const b = buildHistoricalEvaluatorRuleDiagnostic(input);
    assert.deepEqual(a, b);
  });

  it("T. immutability", () => {
    const lifecycle = emptyLifecycle();
    const stats = btcStatisticsFixture();
    const beforeL = JSON.stringify(lifecycle);
    const beforeS = JSON.stringify(stats);
    buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    assert.equal(JSON.stringify(lifecycle), beforeL);
    assert.equal(JSON.stringify(stats), beforeS);
  });

  it("U. architecture guard in module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-evaluator-rule-diagnostic.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEvaluatorRuleDiagnostic"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("fetch("));
  });

  it("V. real BTC integration parity", async () => {
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
    const statsBefore = aggregateIndependentTradeStatistics(lifecycle);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: statsBefore,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      statisticsReport: statsBefore,
      rMultipleStatisticsReport: rStats,
    });
    const entryQ = buildHistoricalEntryReferenceQualityAnalysis({
      lifecycleReport: lifecycle,
      statisticsReport: statsBefore,
      rMultipleStatisticsReport: rStats,
      eligibilityAuditReport: audit,
    });
    const b12f = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: statsBefore,
      lifecycleReport: lifecycle,
    });
    const b12k = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle,
      statisticsReport: statsBefore,
      evaluatorDiagnosticReport: b12f,
      rMultipleStatisticsReport: rStats,
      entryReferenceQualityReport: entryQ,
    });
    assert.equal(b12k.failureReasonAnalysis.available, true);
    if (b12k.failureReasonAnalysis.available) {
      assert.ok(b12k.failureReasonAnalysis.overallByFailureReason.length > 0);
      assert.ok(b12k.failedWinFailureReasonAnalysis.byFailureReason.length > 0);
    }
    const statsAfter = aggregateIndependentTradeStatistics(lifecycle);
    assert.deepEqual(statsAfter.overall.counts, statsBefore.overall.counts);
    assert.equal(
      rStats.overall.sumR,
      aggregateIndependentTradeRMultipleStatistics({
        lifecycleReport: lifecycle,
        statisticsReport: statsAfter,
      }).overall.sumR
    );
    if (statsBefore.overall.counts.decisiveResolutions === 285) {
      assert.equal(b12f.mismatch.passedDecisive, 122);
      assert.equal(b12f.mismatch.failedDecisive, 163);
    }
  });
});
