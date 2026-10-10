import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED,
  EVALUATOR_FAILURE_REASON_INSUFFICIENT_CONTEXT_BUCKET,
} from "../historical-evaluator-failure-reason-contract";
import { buildHistoricalEvaluatorFailureReasonAnalysis } from "../historical-evaluator-failure-reason-analysis";
import { buildHistoricalEvaluatorRuleDiagnostic } from "../historical-evaluator-rule-diagnostic";
import {
  integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic,
} from "../historical-evaluator-rule-diagnostic-b12m-integration";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeLifecycleReport,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";
import { HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION } from "../historical-independent-trade-statistics-types";

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

function minimalStats() {
  return {
    statisticsSchemaVersion: HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION,
    policyId: POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
    snapshotReference: null,
    overall: {
      counts: {
        totalTrades: 1,
        measuredTrades: 1,
        unmeasuredTrades: 0,
        favorableResolutions: 1,
        adverseResolutions: 0,
        wins: 1,
        losses: 0,
        decisiveResolutions: 1,
        inconclusiveSameBar: 0,
        unresolvedAtHorizon: 0,
        unmeasuredNoFuture: 0,
        unmeasuredInsufficient: 0,
        measuredNonDecisive: 0,
        totalTradeObservations: 1,
      },
      denominators: {
        filteredTrades: 1,
        measuredTrades: 1,
        unmeasuredTrades: 0,
        decisiveResolutions: 1,
        measuredNonDecisive: 0,
      },
      classification: {
        FAVORABLE_RESOLUTION: 1,
        ADVERSE_RESOLUTION: 0,
        INCONCLUSIVE_SAME_BAR: 0,
        UNRESOLVED_AT_HORIZON: 0,
        UNMEASURED_NO_FUTURE: 0,
        UNMEASURED_INSUFFICIENT: 0,
      },
      rates: {
        winRate_decisive: {
          numerator: 1,
          denominator: 1,
          value: 1,
          denominatorId: "DECISIVE_RESOLUTIONS" as const,
        },
      },
    },
    evaluationCross: {},
    pathOutcomeDistribution: {},
    duration: {
      sampleCount: 0,
      minDurationBars: null,
      maxDurationBars: null,
      averageDurationBars: null,
      medianDurationBars: null,
    },
    cohorts: {},
    bySymbol: {},
    byTimeframe: {},
    bySetupFamily: {},
    byDirection: {},
    byRrBucket: {},
  } as import("../historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
}

describe("historical-evaluator-rule-diagnostic-b12m-integration", () => {
  it("A. failureReasonAnalysis.available true with lifecycleReport", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    assert.equal(report.failureReasonAnalysis.available, true);
  });

  it("B. unavailable without lifecycleReport", () => {
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      statisticsReport: minimalStats(),
    });
    assert.equal(report.failureReasonAnalysis.available, false);
  });

  it("C. consumes B-12l report fields", () => {
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
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
      failureReasonAnalysisReport: b12l,
    });
    assert.equal(report.failureReasonAnalysis.available, true);
    if (!report.failureReasonAnalysis.available) {
      return;
    }
    assert.deepEqual(
      report.failureReasonAnalysis.overallByFailureReason,
      b12l.overallByFailureReason
    );
    assert.deepEqual(
      report.failedWinFailureReasonAnalysis.byFailureReason,
      b12l.failedTradeOutcomeAnalysis
    );
  });

  it("D. no duplicate failure-reason module in B-12k main file", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rule-diagnostic.ts"
      ),
      "utf8"
    );
    assert.ok(
      mod.includes("integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic")
    );
    assert.ok(!mod.includes("buildHistoricalEvaluatorFailureReasonAnalysis"));
    const integration = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rule-diagnostic-b12m-integration.ts"
      ),
      "utf8"
    );
    assert.ok(integration.includes("buildHistoricalEvaluatorFailureReasonAnalysis"));
  });

  it("E. FAILED + WIN via failedWinFailureReasonAnalysis", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    const slice = report.failedWinFailureReasonAnalysis.byFailureReason.find(
      (r) => r.failureReason === "RR_BELOW_MINIMUM"
    );
    assert.equal(slice!.failedWins, 1);
  });

  it("F. FAILED + LOSS", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "SETUP_INVALIDATED",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    const slice = report.failedWinFailureReasonAnalysis.byFailureReason.find(
      (r) => r.failureReason === "SETUP_INVALIDATED"
    );
    assert.equal(slice!.failedLosses, 1);
  });

  it("G. FAILED_WITH_MISSING_FAILURE_REASON", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: null,
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    assert.equal(report.failureReasonAnalysis.available, true);
    if (!report.failureReasonAnalysis.available) {
      return;
    }
    assert.equal(report.failureReasonAnalysis.missingFailureReasonCount, 1);
    assert.ok(
      report.failureReasonAnalysis.overallByFailureReason.some(
        (r) => r.failureReason === EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED
      )
    );
  });

  it("H. INSUFFICIENT_CONTEXT separate from missing FAILED reason", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "INSUFFICIENT_CONTEXT",
        evaluatorFirstFailure: null,
        policyClassification: "UNMEASURED_INSUFFICIENT",
        pathOutcome: "INSUFFICIENT_CONTEXT",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail("expected available");
    }
    assert.equal(
      report.failureReasonAnalysis.insufficientContextNoFailureReason,
      1
    );
    assert.ok(
      !report.failureReasonAnalysis.overallByFailureReason.some(
        (r) =>
          r.failureReason === EVALUATOR_FAILURE_REASON_INSUFFICIENT_CONTEXT_BUCKET
      )
    );
  });

  it("I. failureReason × outcome", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(report.failureReasonAnalysis.failureReasonByOutcome.length > 0);
  });

  it("J. failureReason × direction", () => {
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
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(
      report.failureReasonAnalysis.byDirection.some(
        (r) => r.dimensionKey === "BEARISH"
      )
    );
  });

  it("K. failureReason × RR", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 2.5,
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(report.failureReasonAnalysis.byRrBucket.length > 0);
  });

  it("L. failureReason × geometry", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(report.failureReasonAnalysis.byGeometry.length > 0);
  });

  it("M. failureReason × exit", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(
      report.failureReasonAnalysis.byExitReason.some(
        (r) => r.dimensionKey === "INVALIDATION_TOUCHED"
      )
    );
  });

  it("N. failureReason × duration", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "ADVERSE_RESOLUTION",
        lifecycleDurationBars: 3,
        pathOutcome: "INVALIDATION_TOUCHED",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    if (!report.failureReasonAnalysis.available) {
      assert.fail();
    }
    assert.ok(report.failureReasonAnalysis.byDuration.length > 0);
  });

  it("O. contribution to FAILED wins", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      unit({
        tradeId: "t2",
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "SETUP_INVALIDATED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    const slices = report.failedWinFailureReasonAnalysis.byFailureReason;
    assert.equal(slices.length, 2);
    assert.equal(
      slices.reduce((s, r) => s + (r.failedWinsContributionToAllFailedWins ?? 0), 0),
      1
    );
  });

  it("P. B-12k status parity unchanged with integration", () => {
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
    const stats = {
      ...minimalStats(),
      overall: {
        ...minimalStats().overall,
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
      },
      evaluationCross,
    } as import("../historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
    const report = buildHistoricalEvaluatorRuleDiagnostic({
      lifecycleReport: lifecycle([]),
      statisticsReport: stats,
    });
    assert.equal(report.statusAnalysis.PASSED.wins, 33);
    assert.equal(report.statusAnalysis.FAILED.wins, 98);
    assert.equal(report.statusAnalysis.FAILED.losses, 65);
  });

  it("Q. deterministic repeat", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const input = {
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    };
    assert.deepEqual(
      buildHistoricalEvaluatorRuleDiagnostic(input),
      buildHistoricalEvaluatorRuleDiagnostic(input)
    );
  });

  it("R. immutability", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        evaluatorFirstFailure: "RR_BELOW_MINIMUM",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const before = JSON.stringify(lc);
    integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic({
      lifecycleReport: lc,
      statisticsReport: minimalStats(),
    });
    assert.equal(JSON.stringify(lc), before);
  });

  it("S. no evaluator invocation in integration module", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rule-diagnostic-b12m-integration.ts"
      ),
      "utf8"
    );
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("T. architecture guard B-12m", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rule-diagnostic-b12m-integration.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("composeProductionWaveScannerForSymbol"));
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!mod.includes("calculatePnL"));
    assert.ok(!mod.includes("optimize("));
    assert.ok(!mod.includes("alarm"));
  });
});
