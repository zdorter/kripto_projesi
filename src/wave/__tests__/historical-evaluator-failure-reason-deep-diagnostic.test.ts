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
import { buildHistoricalEvaluatorFailureReasonAnalysis } from "../historical-evaluator-failure-reason-analysis";
import {
  EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED,
} from "../historical-evaluator-failure-reason-contract";
import {
  buildHistoricalEvaluatorFailureReasonDeepDiagnostic,
  mapPathOutcomeToFailureReasonExitPresentation,
} from "../historical-evaluator-failure-reason-deep-diagnostic";
import {
  HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION,
} from "../historical-evaluator-failure-reason-deep-diagnostic-types";
import { analyzeIndependentTradeEvaluatorDiagnostic } from "../historical-independent-trade-evaluator-diagnostic";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
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

function lifecycle(trades: IndependentTradeUnit[]): IndependentTradeLifecycleReport {
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

describe("historical-evaluator-failure-reason-deep-diagnostic", () => {
  it("A. schema version", () => {
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lifecycle([]),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION
    );
  });

  it("B. master failure reason table", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    const row = report.masterTable.find(
      (r) => r.failureReason === "RR_BELOW_MINIMUM"
    );
    assert.equal(row!.failedTrades, 1);
    assert.equal(row!.failedLosses, 1);
    assert.equal(
      row!.failedWinRateDenominatorId,
      "FAILED_DECISIVE_RESOLUTIONS"
    );
  });

  it("C. FAILED + WIN profile", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(report.failedWinProfiles[0]!.failedWins, 1);
  });

  it("D. FAILED + LOSS", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "SETUP_INVALIDATED",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(report.masterTable[0]!.failedLosses, 1);
  });

  it("E. failure reason × policy outcome", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "INCONCLUSIVE_SAME_BAR",
        pathOutcome: "AMBIGUOUS",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    const row = report.failureReasonByPolicyOutcome[0]!;
    const cell = row.cells.find(
      (c) => c.policyClassification === "INCONCLUSIVE_SAME_BAR"
    );
    assert.equal(cell!.count, 1);
  });

  it("F. failure reason × direction", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        direction: "BEARISH",
        entryReferencePrice: 100,
        targetReferencePrice: 90,
        invalidationReferencePrice: 105,
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(report.byDirection.some((d) => d.direction === "BEARISH"));
  });

  it("G. failure reason × RR", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 0.8,
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(
      report.byProspectiveRr.some((r) => r.prospectiveRrBucket === "LT_1_0")
    );
  });

  it("H. failure reason × geometry", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(report.byGeometry.length > 0);
  });

  it("I. failure reason × family", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        setupFamilyId: "CUSTOM",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(report.bySetupFamily.some((f) => f.setupFamilyId === "CUSTOM"));
  });

  it("J. failure reason × exit presentation", () => {
    assert.equal(
      mapPathOutcomeToFailureReasonExitPresentation("TARGET_TOUCHED"),
      "TARGET"
    );
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
        pathOutcome: "TARGET_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(
      report.byExitPresentation.some((e) => e.exitPresentation === "TARGET")
    );
  });

  it("K. failure reason × duration", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        lifecycleDurationBars: 3,
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(
      report.byDuration.some((d) => d.durationBucket === "DURATION_1_3")
    );
  });

  it("L. conditional slices threshold", () => {
    const trades: IndependentTradeUnit[] = [];
    for (let i = 0; i < 10; i++) {
      trades.push(
        unit({
          tradeId: `t${i}`,
          tradeEvaluationStatus: "FAILED",
          evaluatorFirstFailure: "RR_BELOW_MINIMUM",
          policyClassification:
            i < 6 ? "FAVORABLE_RESOLUTION" : "ADVERSE_RESOLUTION",
          direction: "BULLISH",
          pathOutcome: "TARGET_TOUCHED",
        })
      );
    }
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lifecycle(trades),
    });
    const cond = report.conditionalSlices.find(
      (c) =>
        c.dimension === "DIRECTION" &&
        c.dimensionValue === "BULLISH" &&
        c.failureReason === "RR_BELOW_MINIMUM"
    );
    assert.ok(cond);
    assert.equal(cond!.trades, 10);
    assert.equal(cond!.decisive, 10);
  });

  it("M. contribution to FAILED wins", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(
      report.concentration.byFailureReason[0]!.failedWinShare,
      1
    );
  });

  it("N. contribution to overall decisive wins", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(
      report.masterTable[0]!.contributionToAllDecisiveWins,
      1
    );
  });

  it("O. delta vs overall", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.ok(
      report.masterTable[0]!.winRateDeltaFromOverallDecisivePercentagePoints !==
        null
    );
  });

  it("P. delta vs FAILED baseline", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(
      report.masterTable[0]!.winRateDeltaFromFailedDecisivePercentagePoints,
      0
    );
  });

  it("Q. missing reason", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: null,
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(report.unknownPopulation.failedWithMissingFailureReason, 1);
    assert.ok(
      report.masterTable.some(
        (r) => r.failureReason === EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED
      )
    );
  });

  it("R. insufficient context", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "INSUFFICIENT_CONTEXT",
        evaluatorFirstFailure: null,
        policyClassification: "UNMEASURED_INSUFFICIENT",
        pathOutcome: "INSUFFICIENT_CONTEXT",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
    });
    assert.equal(
      report.unknownPopulation.insufficientContextNoFailureReason,
      1
    );
  });

  it("S. B-12c parity via consumed B-12l", () => {
    const b12l = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lifecycle([
        unit({
          tradeEvaluationStatus: "FAILED",
          evaluatorFirstFailure: "RR_BELOW_MINIMUM",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
    });
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lifecycle([
        unit({
          tradeEvaluationStatus: "FAILED",
          evaluatorFirstFailure: "RR_BELOW_MINIMUM",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
      failureReasonAnalysisReport: b12l,
    });
    assert.equal(report.parity.observedOverallWins, b12l.parity.lifecycleWins);
  });

  it("T. B-12l parity master table", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const b12l = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
      failureReasonAnalysisReport: b12l,
    });
    assert.equal(
      report.masterTable[0]!.failedWins,
      b12l.failedTradeOutcomeAnalysis[0]!.failedWins
    );
  });

  it("U. B-12g R reference only", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lc);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lc,
      statisticsReport: stats,
    });
    const sumBefore = rStats.overall.sumR;
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    assert.equal(report.rMultipleReference.sumR, sumBefore);
    const sumAfter = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lc,
      statisticsReport: stats,
    }).overall.sumR;
    assert.equal(sumAfter, sumBefore);
  });

  it("V. B-12j geometry reference", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const stats = aggregateIndependentTradeStatistics(lc);
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lc,
      statisticsReport: stats,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lc,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
    });
    const entryQ = buildHistoricalEntryReferenceQualityAnalysis({
      lifecycleReport: lc,
      statisticsReport: stats,
      rMultipleStatisticsReport: rStats,
      eligibilityAuditReport: audit,
    });
    const report = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
      entryReferenceQualityReport: entryQ,
    });
    assert.equal(report.geometryReference.available, true);
    assert.ok(report.byGeometry.length > 0);
  });

  it("W. deterministic repeat", () => {
    const input = {
      lifecycleReport: lifecycle([
        unit({
          tradeEvaluationStatus: "FAILED",
          evaluatorFirstFailure: "RR_BELOW_MINIMUM",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
    };
    assert.deepEqual(
      buildHistoricalEvaluatorFailureReasonDeepDiagnostic(input),
      buildHistoricalEvaluatorFailureReasonDeepDiagnostic(input)
    );
  });

  it("X. immutability", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const b12l = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    const before = JSON.stringify({ lc, b12l });
    buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport: lc,
      failureReasonAnalysisReport: b12l,
    });
    assert.equal(JSON.stringify({ lc, b12l }), before);
  });

  it("Y. architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-failure-reason-deep-diagnostic.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEvaluatorFailureReasonDeepDiagnostic"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("trade-evaluation.ts"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetchBinance"));
  });

  it("Z. real BTC integration observational", async () => {
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
    const lifecycleReport = buildIndependentTradeLifecycleReport({
      report: result.report,
      entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    });
    const statsBefore = aggregateIndependentTradeStatistics(lifecycleReport);
    const rBefore = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport,
      statisticsReport: statsBefore,
    });
    const b12f = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: statsBefore,
      lifecycleReport,
    });
    const b12l = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport,
      statisticsReport: statsBefore,
    });
    const deep = buildHistoricalEvaluatorFailureReasonDeepDiagnostic({
      lifecycleReport,
      statisticsReport: statsBefore,
      evaluatorDiagnosticReport: b12f,
      failureReasonAnalysisReport: b12l,
      rMultipleStatisticsReport: rBefore,
    });
    assert.ok(deep.masterTable.length > 0);
    assert.ok(deep.failedWinProfiles.length > 0);
    assert.ok(deep.findings.length > 0);
    const rAfter = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport,
      statisticsReport: aggregateIndependentTradeStatistics(lifecycleReport),
    });
    assert.equal(rAfter.overall.sumR, rBefore.overall.sumR);
  });
});
