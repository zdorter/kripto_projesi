import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeIndependentTradeEvaluatorDiagnostic,
} from "../historical-independent-trade-evaluator-diagnostic";
import { HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION } from "../historical-independent-trade-evaluator-diagnostic-types";
import { HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION } from "../historical-independent-trade-statistics-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import type { IndependentTradeStatisticsReport } from "../historical-independent-trade-statistics-types";
import { compareIndependentTradeGroups } from "../historical-independent-trade-statistical-validation";
import type { IndependentTradeStatisticalValidationReport } from "../historical-independent-trade-statistical-validation-types";
import { HISTORICAL_MEASUREMENT_COHORTS } from "../setup/historical-measurement-contract";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeLifecycleReport,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";

function emptySliceCounts() {
  return {
    totalTrades: 0,
    measuredTrades: 0,
    unmeasuredTrades: 0,
    favorableResolutions: 0,
    adverseResolutions: 0,
    wins: 0,
    losses: 0,
    decisiveResolutions: 0,
    inconclusiveSameBar: 0,
    unresolvedAtHorizon: 0,
    unmeasuredNoFuture: 0,
    unmeasuredInsufficient: 0,
    measuredNonDecisive: 0,
    totalTradeObservations: 0,
  };
}

function emptySlice() {
  return {
    counts: emptySliceCounts(),
    denominators: {
      filteredTrades: 0,
      measuredTrades: 0,
      unmeasuredTrades: 0,
      decisiveResolutions: 0,
      measuredNonDecisive: 0,
    },
    classification: {
      FAVORABLE_RESOLUTION: 0,
      ADVERSE_RESOLUTION: 0,
      INCONCLUSIVE_SAME_BAR: 0,
      UNRESOLVED_AT_HORIZON: 0,
      UNMEASURED_NO_FUTURE: 0,
      UNMEASURED_INSUFFICIENT: 0,
    },
    rates: {
      winRate_decisive: {
        numerator: 0,
        denominator: 0,
        value: null,
        denominatorId: "DECISIVE_RESOLUTIONS" as const,
      },
    },
  };
}

/** BTCUSDT 1H independent-trade evaluation cross (B-12c/B-12e parity). */
function btcStatisticsFixture(): IndependentTradeStatisticsReport {
  const overallCounts = {
    ...emptySliceCounts(),
    totalTrades: 340,
    measuredTrades: 340,
    favorableResolutions: 131,
    adverseResolutions: 154,
    wins: 131,
    losses: 154,
    decisiveResolutions: 285,
    inconclusiveSameBar: 8,
    unresolvedAtHorizon: 47,
    totalTradeObservations: 340,
    measuredNonDecisive: 55,
  };
  const overall = {
    counts: overallCounts,
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
  };
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
    overall,
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
      HISTORICAL_MEASUREMENT_COHORTS.map((c) => [c, emptySlice()])
    ) as IndependentTradeStatisticsReport["cohorts"],
    bySymbol: {},
    byTimeframe: {},
    bySetupFamily: {},
    byDirection: {} as IndependentTradeStatisticsReport["byDirection"],
    byRrBucket: {} as IndependentTradeStatisticsReport["byRrBucket"],
  };
}

function tradeUnit(
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
    snapshotCohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
    setupFamilyId: patch.setupFamilyId ?? "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus,
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome ?? "TARGET_TOUCHED",
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 13,
    resolutionBarIndex: 13,
    barsAfterEvaluation: 3,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 3,
  };
}

describe("historical-independent-trade-evaluator-diagnostic", () => {
  it("schema version", () => {
    const stats = btcStatisticsFixture();
    const report = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION
    );
  });

  it("PASSED 33/122 and FAILED 98/163 locks", () => {
    const stats = btcStatisticsFixture();
    const report = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    assert.equal(report.mismatch.passedWins, 33);
    assert.equal(report.mismatch.passedLosses, 89);
    assert.equal(report.mismatch.passedDecisive, 122);
    assert.equal(report.mismatch.failedWins, 98);
    assert.equal(report.mismatch.failedLosses, 65);
    assert.equal(report.mismatch.failedDecisive, 163);
  });

  it("PASSED and FAILED win rates", () => {
    const stats = btcStatisticsFixture();
    const report = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    assert.equal(report.evaluation.passed.decisiveWinRate, 33 / 122);
    assert.equal(report.evaluation.failed.decisiveWinRate, 98 / 163);
    assert.ok(Math.abs(report.evaluation.passed.decisiveWinRate! - 0.27049180327868855) < 1e-12);
    assert.ok(Math.abs(report.evaluation.failed.decisiveWinRate! - 0.6012269938650306) < 1e-12);
  });

  it("decisive win rate difference ≈ -33.07 pp", () => {
    const stats = btcStatisticsFixture();
    const report = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    const diff = report.mismatch.decisiveWinRateDifferencePercentagePoints!;
    assert.ok(Math.abs(diff - (-33.0735190586172)) < 0.01);
  });

  it("mismatch failure modes", () => {
    const stats = btcStatisticsFixture();
    const report = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    assert.equal(report.evaluation.evaluationOutcomeCross.PASSED.FAVORABLE_RESOLUTION, 33);
    assert.equal(report.evaluation.evaluationOutcomeCross.PASSED.ADVERSE_RESOLUTION, 89);
    assert.equal(report.evaluation.evaluationOutcomeCross.FAILED.FAVORABLE_RESOLUTION, 98);
    assert.equal(report.evaluation.evaluationOutcomeCross.FAILED.ADVERSE_RESOLUTION, 65);
  });

  it("sample quality on decisive counts (B-12d contract)", () => {
    const report = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: btcStatisticsFixture(),
    });
    assert.equal(report.evaluation.passed.sampleSizeQuality, "LARGE_SAMPLE");
    assert.equal(report.evaluation.failed.sampleSizeQuality, "LARGE_SAMPLE");
    assert.equal(report.evaluation.passed.interpretWithCaution, false);
    assert.equal(report.evaluation.passed.contributionToDecisiveWins, 33 / 131);
    assert.equal(report.evaluation.failed.contributionToDecisiveWins, 98 / 131);
  });

  it("evaluation × direction from lifecycle trades", () => {
    const stats = btcStatisticsFixture();
    const trades = [
      tradeUnit({
        tradeId: "p1",
        tradeEvaluationStatus: "PASSED",
        policyClassification: "ADVERSE_RESOLUTION",
        pathOutcome: "INVALIDATION_TOUCHED",
        direction: "BEARISH",
      }),
      tradeUnit({
        tradeId: "f1",
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        pathOutcome: "TARGET_TOUCHED",
        direction: "BULLISH",
      }),
    ];
    const lifecycle: IndependentTradeLifecycleReport = {
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
        totalSnapshots: 2,
        eligibleEntrySnapshots: 2,
        rejectedByMutex: 0,
        rejectedSiblingNotSelected: 0,
        rejectedPathUnmeasured: 0,
        independentTrades: 2,
        measuredTrades: 2,
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
    const report = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    assert.ok(report.byDirection.some((s) => s.dimensionKey === "BEARISH" && s.evaluationStatus === "PASSED"));
    assert.ok(report.byDirection.some((s) => s.dimensionKey === "BULLISH" && s.evaluationStatus === "FAILED"));
  });

  it("evaluation × RR, setup family, exit reason, duration from lifecycle", () => {
    const stats = btcStatisticsFixture();
    const trades = [
      tradeUnit({
        tradeId: "rr-p",
        tradeEvaluationStatus: "PASSED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 0.8,
        setupFamilyId: "FAM_A",
        pathOutcome: "INVALIDATION_TOUCHED",
        lifecycleDurationBars: 2,
      }),
      tradeUnit({
        tradeId: "rr-f",
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2.5,
        setupFamilyId: "FAM_B",
        pathOutcome: "TARGET_TOUCHED",
        lifecycleDurationBars: 10,
      }),
    ];
    const lifecycle: IndependentTradeLifecycleReport = {
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
        totalSnapshots: 2,
        eligibleEntrySnapshots: 2,
        rejectedByMutex: 0,
        rejectedSiblingNotSelected: 0,
        rejectedPathUnmeasured: 0,
        independentTrades: 2,
        measuredTrades: 2,
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
    const report = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: stats,
      lifecycleReport: lifecycle,
    });
    assert.ok(
      report.byRrBucket.some(
        (s) => s.evaluationStatus === "PASSED" && s.dimensionKey === "LT_1_0"
      )
    );
    assert.ok(
      report.bySetupFamily.some(
        (s) => s.evaluationStatus === "FAILED" && s.dimensionKey === "FAM_B"
      )
    );
    assert.ok(
      report.byExitReason.some(
        (r) =>
          r.evaluationStatus === "PASSED" &&
          r.pathOutcome === "INVALIDATION_TOUCHED" &&
          r.count === 1
      )
    );
    assert.ok(
      report.byDuration.some(
        (s) => s.evaluationStatus === "FAILED" && s.dimensionKey === "DURATION_7_12"
      )
    );
    assert.equal(report.durationSummary.length, 3);
  });

  it("reuses B-12e validation comparison when provided", () => {
    const stats = btcStatisticsFixture();
    const passedVsFailed = compareIndependentTradeGroups(
      { wins: 33, losses: 89 },
      { wins: 98, losses: 65 }
    );
    const validationReport = {
      evaluationComparison: { passedVsFailed },
    } as IndependentTradeStatisticalValidationReport;
    const report = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: stats,
      validationReport,
    });
    assert.equal(report.evaluation.passedVsFailedComparison?.pValue, passedVsFailed.pValue);
  });

  it("deterministic and immutability", () => {
    const stats = btcStatisticsFixture();
    const before = JSON.stringify(stats);
    const a = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    const b = analyzeIndependentTradeEvaluatorDiagnostic({ statisticsReport: stats });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(stats), before);
  });

  it("warnings present", () => {
    const report = analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport: btcStatisticsFixture(),
    });
    assert.ok(report.warnings.notEvaluatorVerdict.length > 0);
    assert.ok(report.warnings.noPnL.length > 0);
  });

  it("architecture: no evaluator/path/PnL", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-independent-trade-evaluator-diagnostic.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("analyzeIndependentTradeEvaluatorDiagnostic"));
    assert.ok(!mod.includes("evaluateTradeEvaluation"));
    assert.ok(!mod.includes("runHistoricalPositionPathBatch"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("aggregateIndependentTradeStatistics"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!mod.includes("optimize("));
  });
});
