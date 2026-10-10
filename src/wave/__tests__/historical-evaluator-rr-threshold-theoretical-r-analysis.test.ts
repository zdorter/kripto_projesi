import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../historical-ohlcv-dataset-loader";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import {
  HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION,
  RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD,
} from "../historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION } from "../historical-independent-trade-r-eligibility-audit-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "../historical-independent-trade-r-eligibility-audit-types";
import { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "../historical-independent-trade-r-multiple-contract";
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

function frozenAuditForTrades(
  trades: readonly IndependentTradeUnit[]
): HistoricalIndependentTradeREligibilityAuditReport {
  const decisive = trades.filter(
    (t) =>
      t.policyClassification === "FAVORABLE_RESOLUTION" ||
      t.policyClassification === "ADVERSE_RESOLUTION"
  ).length;
  return {
    schemaVersion: HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION,
    rMultipleContractVersion: HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION,
    auditScopeNote: "fixture",
    canonicalSourceNotes: [],
    population: { independentTrades: trades.length, decisiveTrades: decisive },
    decisiveParity: {
      decisiveTrades: decisive,
      validTheoreticalRTrades: decisive,
      decisiveWithoutTheoreticalR: 0,
      parityInvariantHolds: true,
    },
    geometryDistribution: {
      VALID_BULLISH_GEOMETRY: decisive,
      VALID_BEARISH_GEOMETRY: 0,
      INVALID_RISK_REFERENCE: 0,
      INCONSISTENT_TARGET_DIRECTION: 0,
      INVALID_DIRECTION: 0,
      INVALID_PRICE_REFERENCE: 0,
    },
    rejectionDistributionAmongDecisiveWithoutR: {
      INVALID_ENTRY_REFERENCE: 0,
      INVALID_TARGET_REFERENCE: 0,
      INVALID_INVALIDATION_REFERENCE: 0,
      INVALID_DIRECTION: 0,
      INVALID_RISK_REFERENCE: 0,
      INCONSISTENT_TARGET_DIRECTION: 0,
    },
    rootCauseDistribution: {
      REFERENCE_DATA_INCONSISTENT: 0,
      DIRECTION_LEVEL_MISMATCH: 0,
      CANONICAL_RR_PRICE_MISMATCH: 0,
      EXPECTED_HISTORICAL_CONTRACT_BEHAVIOR: decisive,
      OTHER: 0,
      UNKNOWN: 0,
    },
    rrConsistency: {
      decisiveWithComparableRr: 0,
      withinToleranceCount: 0,
      outsideToleranceCount: 0,
      missingCanonicalRrCount: 0,
      missingDerivedRrCount: 0,
      note: "fixture",
    },
    decisiveRows: trades.map((t) => ({
      tradeId: t.tradeId,
      snapshotId: t.snapshotId,
      evaluationBarIndex: t.evaluationBarIndex,
      prospectiveSetupId: t.prospectiveSetupId,
      direction: t.direction,
      entryReferencePrice: t.entryReferencePrice,
      targetReferencePrice: t.targetReferencePrice,
      invalidationReferencePrice: t.invalidationReferencePrice,
      canonicalRrRatio: t.canonicalRrRatio,
      pathOutcome: t.pathOutcome,
      policyClassification: t.policyClassification,
      lifecycleDurationBars: t.lifecycleDurationBars,
      geometryClassification: "VALID_BULLISH_GEOMETRY",
      b12gRejectionReasons: [],
      theoreticalREligible:
        t.policyClassification === "FAVORABLE_RESOLUTION" ||
        t.policyClassification === "ADVERSE_RESOLUTION",
      theoreticalR:
        t.policyClassification === "FAVORABLE_RESOLUTION" ||
        t.policyClassification === "ADVERSE_RESOLUTION"
          ? 1.5
          : null,
      derivedProspectiveRrFromPrices: null,
      canonicalRrDelta: null,
      canonicalRrWithinTolerance: null,
      rootCauseCategory: "EXPECTED_HISTORICAL_CONTRACT_BEHAVIOR",
      rootCauseNote: "fixture",
      observedWin: t.policyClassification === "FAVORABLE_RESOLUTION",
      observedLoss: t.policyClassification === "ADVERSE_RESOLUTION",
    })),
    samples: { firstValidDecisiveTrades: [], firstInvalidDecisiveTrades: [] },
    warnings: {
      auditOnly: "",
      noSilentRepair: "",
      noOutcomeMutation: "",
      prospectiveVsDerivedRr: "",
    },
  };
}

function auditFor(lc: IndependentTradeLifecycleReport) {
  if (lc.trades.length <= 1) {
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
  return frozenAuditForTrades(lc.trades);
}

describe("historical-evaluator-rr-threshold-theoretical-r-analysis", () => {
  it("schema version", () => {
    const lc = lifecycle([]);
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION
    );
  });

  it("threshold ordering and pass/fail tables", () => {
    const lc = lifecycle([
      unit({
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
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    assert.equal(report.passComparisonTable.length, 7);
    const at15 = report.passComparisonTable.find((r) => r.threshold === 1.5)!;
    assert.equal(at15.passTrades, 1);
    assert.equal(report.failComparisonTable.find((r) => r.threshold === 1.5)!.failTrades, 1);
  });

  it("expectancy uses theoretical-R-eligible denominator", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
    ]);
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    const pass = report.thresholdSlices.find((s) => s.threshold === 1.5)!.counterfactualPassed;
    assert.equal(pass.expectancyDenominatorId, "THEORETICAL_R_ELIGIBLE_DECISIVE");
    if (pass.theoreticalREligibleDecisive > 0) {
      assert.equal(pass.expectancyR, pass.sumR / pass.theoreticalREligibleDecisive);
    }
  });

  it("CURRENT FAILED + TARGET_TOUCHED counterfactual split", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        pathOutcome: "TARGET_TOUCHED",
        canonicalRrRatio: 0.8,
      }),
    ]);
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    const low = report.currentFailedTargetTouched.find((r) => r.threshold === 0.5)!;
    const high = report.currentFailedTargetTouched.find((r) => r.threshold === 1.5)!;
    assert.equal(low.counterfactualPassed, 1);
    assert.equal(high.counterfactualFailed, 1);
  });

  it("prospective RR bands", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 0.8,
      }),
      unit({
        tradeId: "m",
        tradeEvaluationStatus: "FAILED",
        policyClassification: "ADVERSE_RESOLUTION",
        canonicalRrRatio: 1.2,
      }),
      unit({
        tradeId: "h",
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
    ]);
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    assert.equal(report.prospectiveBandComparison.length, 3);
    assert.ok(report.prospectiveRrBucketAnalysis.some((b) => b.prospectiveRrBucket === "LT_1_0"));
  });

  it("baseline deltas zero at 1.5", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 2,
      }),
    ]);
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    });
    const base = report.baselineDeltas.find(
      (d) => d.threshold === RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD
    )!;
    assert.equal(base.deltaPassPopulation, 0);
  });

  it("deterministic", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "FAILED",
        policyClassification: "FAVORABLE_RESOLUTION",
        canonicalRrRatio: 1.2,
      }),
    ]);
    const input = {
      lifecycleReport: lc,
      eligibilityAuditReport: auditFor(lc),
    };
    assert.deepEqual(
      buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis(input),
      buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis(input)
    );
  });

  it("immutability", () => {
    const lc = lifecycle([
      unit({
        tradeEvaluationStatus: "PASSED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const audit = auditFor(lc);
    const before = JSON.stringify({ lc, audit });
    buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport: lc,
      eligibilityAuditReport: audit,
    });
    assert.equal(JSON.stringify({ lc, audit }), before);
  });

  it("architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-evaluator-rr-threshold-theoretical-r-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("trade-evaluation.ts"));
    assert.ok(!mod.includes("computeTheoreticalTradeRMultiple"));
    assert.ok(!mod.includes("aggregateIndependentTradeRMultipleStatistics"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("fetchBinance"));
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
    const report = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
      lifecycleReport,
      eligibilityAuditReport: audit,
    });
    assert.equal(report.passComparisonTable.length, 7);
    assert.ok(report.diagnosticSummary.length > 0);
    const rAfter = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport,
      statisticsReport: stats,
    });
    assert.equal(rAfter.overall.sumR, rBefore.overall.sumR);
  });
});
