import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../historical-ohlcv-dataset-loader";
import {
  buildHistoricalEvaluatorRrThresholdCounterfactual,
  resolveCounterfactualEvaluationStatus,
} from "../historical-evaluator-rr-threshold-counterfactual";
import {
  CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD,
  HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS,
  HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION,
} from "../historical-evaluator-rr-threshold-counterfactual-types";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
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

function auditFromLifecycle(lc: IndependentTradeLifecycleReport) {
  const stats = aggregateIndependentTradeStatistics(lc);
  const rStats = aggregateIndependentTradeRMultipleStatistics({
    lifecycleReport: lc,
    statisticsReport: stats,
  });
  return auditIndependentTradeTheoreticalREligibility({
    lifecycleReport: lc,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
  });
}

describe("historical-evaluator-rr-threshold-counterfactual", () => {
  it("schema version", () => {
    const report = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lifecycle([]),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION
    );
  });

  it("threshold ordering", () => {
    const report = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lifecycle([
        unit({
          tradeEvaluationStatus: "FAILED",
          policyClassification: "ADVERSE_RESOLUTION",
          canonicalRrRatio: 1.2,
        }),
      ]),
    });
    const thresholds = report.summaryTable.map((r) => r.threshold);
    assert.deepEqual(thresholds, [...HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS]);
  });

  it("RR boundaries", () => {
    assert.equal(resolveCounterfactualEvaluationStatus(0.49, 0.5), "FAILED");
    assert.equal(resolveCounterfactualEvaluationStatus(0.5, 0.5), "PASSED");
    assert.equal(resolveCounterfactualEvaluationStatus(0.74, 0.75), "FAILED");
    assert.equal(resolveCounterfactualEvaluationStatus(0.75, 0.75), "PASSED");
    assert.equal(resolveCounterfactualEvaluationStatus(0.99, 1.0), "FAILED");
    assert.equal(resolveCounterfactualEvaluationStatus(1.0, 1.0), "PASSED");
    assert.equal(resolveCounterfactualEvaluationStatus(1.49, 1.5), "FAILED");
    assert.equal(resolveCounterfactualEvaluationStatus(1.5, 1.5), "PASSED");
    assert.equal(resolveCounterfactualEvaluationStatus(1.99, 2.0), "FAILED");
    assert.equal(resolveCounterfactualEvaluationStatus(2.0, 2.0), "PASSED");
  });

  it("null/invalid RR NOT_CLASSIFIABLE", () => {
    assert.equal(resolveCounterfactualEvaluationStatus(null, 1.5), "NOT_CLASSIFIABLE");
    assert.equal(
      resolveCounterfactualEvaluationStatus(Number.NaN, 1.5),
      "NOT_CLASSIFIABLE"
    );
    const lc = lifecycle([
      {
        ...unit({
          tradeEvaluationStatus: "FAILED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
        canonicalRrRatio: null,
      },
    ]);
    const row = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds.find((t) => t.threshold === 1.5)!;
    assert.equal(row.notClassifiable.totalTrades, 1);
  });

  it("current 1.5 RR-only counterfactual parity", () => {
    const lc = lifecycle([
      unit({
        tradeId: "a",
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
      unit({
        tradeId: "b",
        tradeEvaluationStatus: "FAILED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 1,
      }),
    ]);
    const row = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds.find((t) => t.threshold === 1.5)!;
    assert.equal(row.counterfactualPassed.totalTrades, 1);
    assert.equal(row.counterfactualFailed.totalTrades, 1);
  });

  it("current PASS/FAIL frozen status preserved in transitions", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
      unit({
        tradeId: "f",
        tradeEvaluationStatus: "FAILED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 1,
      }),
    ]);
    const row = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds.find((t) => t.threshold === 1.5)!;
    assert.equal(row.populationChanges.unchangedPassed, 1);
    assert.equal(row.populationChanges.unchangedFailed, 1);
  });

  it("CURRENT FAILED + WIN identification", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 0.8,
      }),
    ]);
    const row = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds.find((t) => t.threshold === 1.5)!;
    assert.equal(row.currentFailedHistoricalWin.currentFailedHistoricalWinTrades, 1);
    assert.equal(row.currentFailedHistoricalWin.counterfactualFailedAtThreshold, 1);
    const rowLow = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds.find((t) => t.threshold === 0.5)!;
    assert.equal(rowLow.currentFailedHistoricalWin.counterfactualPassedAtThreshold, 1);
  });

  it("deterministic repeat", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 1.2,
      }),
    ]);
    const input = { lifecycleReport: lc };
    assert.deepEqual(
      buildHistoricalEvaluatorRrThresholdCounterfactual(input),
      buildHistoricalEvaluatorRrThresholdCounterfactual(input)
    );
  });

  it("immutability", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 1,
      }),
    ]);
    const before = JSON.stringify(lc);
    buildHistoricalEvaluatorRrThresholdCounterfactual({ lifecycleReport: lc });
    assert.equal(JSON.stringify(lc), before);
  });

  it("no evaluator invocation in module", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rr-threshold-counterfactual.ts"
      ),
      "utf8"
    );
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("trade-evaluation.ts"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("aggregateIndependentTradeRMultipleStatistics"));
    assert.ok(!mod.includes("computeTheoreticalTradeRMultiple"));
  });

  it("frozen R from audit only (no R pipeline in module)", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
      }),
    ]);
    const audit = auditFromLifecycle(lc);
    const report = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
      eligibilityAuditReport: audit,
    });
    const row = report.thresholds.find((t) => t.threshold === 1.5)!;
    assert.equal(row.theoreticalR.passed.available, true);
    assert.ok(row.theoreticalR.passed.sumR !== 0 || row.theoreticalR.passed.rEligibleDecisiveTrades === 0);
  });

  it("reference threshold constant", () => {
    assert.equal(CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD, 1.5);
  });

  it("Wilson CI present on snapshot", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
    ]);
    const row = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport: lc,
    }).thresholds[0]!;
    assert.equal(row.counterfactualPassed.wilson95.method, "WILSON_SCORE_INTERVAL");
    assert.equal(row.counterfactualPassed.wilson95.confidenceLevel, 0.95);
  });

  it("real BTC integration", async () => {
    const candles = await fetchBinanceFuturesHistoricalCandles(
      "BTCUSDT",
      "1H",
      REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES
    );
    const range = resolveRealHistoricalBacktestEvaluationRange(candles.length, 24);
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
    const stats = aggregateIndependentTradeStatistics(lifecycleReport);
    const rBefore = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport,
      statisticsReport: stats,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport,
      statisticsReport: stats,
      rMultipleStatisticsReport: rBefore,
    });
    const report = buildHistoricalEvaluatorRrThresholdCounterfactual({
      lifecycleReport,
      eligibilityAuditReport: audit,
      rMultipleStatisticsReport: rBefore,
      statisticsReport: stats,
    });
    assert.equal(report.summaryTable.length, 7);
    const rAfter = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport,
      statisticsReport: stats,
    });
    assert.equal(rAfter.overall.sumR, rBefore.overall.sumR);
  });
});
