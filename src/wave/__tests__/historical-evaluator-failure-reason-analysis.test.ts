import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import { analyzeIndependentTradeEvaluatorDiagnostic } from "../historical-independent-trade-evaluator-diagnostic";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import {
  buildHistoricalEvaluatorFailureReasonAnalysis,
  resolveEvaluatorFailureReasonBucket,
} from "../historical-evaluator-failure-reason-analysis";
import { EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED } from "../historical-evaluator-failure-reason-contract";
import { HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION } from "../historical-evaluator-failure-reason-contract";
import { EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH } from "../historical-evaluator-failure-reason-types";
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
    direction: "BULLISH",
    entryReferencePrice: 100,
    targetReferencePrice: 110,
    invalidationReferencePrice: 95,
    canonicalRrRatio: 2,
    snapshotCohorts: ["ALL_PRODUCTION_CANDIDATES"],
    setupFamilyId: "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus,
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome ?? "TARGET_TOUCHED",
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 12,
    resolutionBarIndex: 12,
    barsAfterEvaluation: 2,
    lifecycleDurationBars: 2,
    ...patch,
  };
}

describe("historical-evaluator-failure-reason-analysis", () => {
  it("A. schema version", () => {
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lifecycle([]),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION
    );
  });

  it("B. canonical firstFailure source", () => {
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lifecycle([]),
    });
    assert.equal(
      report.canonicalSource.artifactPath,
      EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH
    );
    assert.equal(report.canonicalSource.lifecycleField, "evaluatorFirstFailure");
  });

  it("C. FAILED + known reason", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    const row = report.overallByFailureReason.find(
      (r) => r.failureReason === "RR_BELOW_MINIMUM"
    );
    assert.equal(row!.totalTrades, 1);
    assert.equal(row!.losses, 1);
  });

  it("D. FAILED + missing reason", () => {
    const bucket = resolveEvaluatorFailureReasonBucket(
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: null,
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      })
    );
    assert.equal(bucket, EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED);
  });

  it("E. PASSED + no reason bucket", () => {
    assert.equal(
      resolveEvaluatorFailureReasonBucket(
        unit({
          tradeEvaluationStatus: "PASSED",
          evaluatorFirstFailure: null,
          policyClassification: "FAVORABLE_RESOLUTION",
        })
      ),
      null
    );
  });

  it("F. INSUFFICIENT_CONTEXT + no reason", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "INSUFFICIENT_CONTEXT",
        evaluatorFirstFailure: null,
        policyClassification: "UNMEASURED_INSUFFICIENT",
        pathOutcome: "INSUFFICIENT_CONTEXT",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    assert.equal(report.unknownPopulation.insufficientContextNoFailureReason, 1);
    assert.equal(report.overallByFailureReason.length, 0);
  });

  it("G. FAILED + WIN", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    assert.equal(report.failedTradeOutcomeAnalysis[0]!.failedWins, 1);
  });

  it("H. FAILED + LOSS", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "SETUP_INVALIDATED",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    assert.equal(report.failedTradeOutcomeAnalysis[0]!.failedLosses, 1);
  });

  it("I. failureReason × outcome", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      unit({
        tradeId: "l",
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const cross = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    }).failureReasonByOutcome[0]!;
    assert.equal(cross.byOutcome.wins, 1);
    assert.equal(cross.byOutcome.losses, 1);
  });

  it("J–O. dimension slices non-empty", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
        lifecycleDurationBars: 2,
      }),
    ]);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    assert.ok(report.byDirection.length >= 1);
    assert.ok(report.byRrBucket.length >= 1);
    assert.ok(report.bySetupFamily.length >= 1);
    assert.ok(report.byGeometry.length >= 1);
    assert.ok(report.byExitReason.length >= 1);
    assert.ok(report.byDuration.length >= 1);
  });

  it("P. failedWinRateDecisive", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const slice = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    }).failedTradeOutcomeAnalysis[0]!;
    assert.equal(slice.failedWinRateDecisive.value, 1);
  });

  it("Q. denominator IDs on passed summary", () => {
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lifecycle([
        unit({
          tradeEvaluationStatus: "PASSED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ]),
    });
    assert.equal(
      report.passedTradeOutcomeAnalysis.denominatorId,
      "PASSED_DECISIVE_RESOLUTIONS"
    );
  });

  it("R. B-12c parity", () => {
    const trades = [
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      unit({
        tradeId: "f",
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ];
    const lc = lifecycle(trades);
    const stats = aggregateIndependentTradeStatistics(lc);
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
      statisticsReport: stats,
    });
    assert.equal(report.parity.parityHolds, true);
    assert.equal(report.parity.lifecycleWins, stats.overall.counts.wins);
  });

  it("S. B-12k parity passed/failed decisive", () => {
    const trades = [
      unit({
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
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      unit({
        tradeId: "fl",
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ];
    const lc = lifecycle(trades);
    const stats = aggregateIndependentTradeStatistics(lc);
    const b12f = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: stats,
      lifecycleReport: lc,
    });
    const report = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
      statisticsReport: stats,
      evaluatorDiagnosticReport: b12f,
    });
    assert.equal(report.passedTradeOutcomeAnalysis.passedWins, 1);
    assert.equal(report.passedTradeOutcomeAnalysis.passedLosses, 1);
    assert.equal(report.passedTradeOutcomeAnalysis.passedDecisive, 2);
    const failedWins = report.failedTradeOutcomeAnalysis.reduce(
      (s, r) => s + r.failedWins,
      0
    );
    const failedLosses = report.failedTradeOutcomeAnalysis.reduce(
      (s, r) => s + r.failedLosses,
      0
    );
    assert.equal(failedWins, 1);
    assert.equal(failedLosses, 1);
  });

  it("T. deterministic repeat", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const a = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    const b = buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: lc,
    });
    assert.deepEqual(a, b);
  });

  it("U. immutability", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const before = JSON.stringify(lc);
    buildHistoricalEvaluatorFailureReasonAnalysis({ lifecycleReport: lc });
    assert.equal(JSON.stringify(lc), before);
  });

  it("V. no evaluator call in analysis module", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-failure-reason-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("lifecycle freezes firstFailure from artifact", () => {
    const report = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const lifecycleReport = buildIndependentTradeLifecycleReport({ report });
    for (const t of lifecycleReport.trades) {
      const entry = report.artifact.measurements.find(
        (m) => m.snapshotId === t.snapshotId
      );
      assert.ok(entry);
      assert.equal(
        t.evaluatorFirstFailure,
        entry.evaluation.tradeEvaluation.firstFailure
      );
      assert.equal(
        t.tradeEvaluationStatus,
        entry.evaluation.tradeEvaluation.status
      );
    }
  });
});
