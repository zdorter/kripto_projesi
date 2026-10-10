import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../historical-ohlcv-dataset-loader";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { computeTheoreticalTradeRMultiple } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { classifyTheoreticalRGeometryForAudit } from "../historical-independent-trade-r-eligibility-audit";
import { buildHistoricalTheoreticalPerformanceReport } from "../historical-theoretical-performance-report";
import {
  buildHistoricalEntryReferenceQualityAnalysis,
  classifyEntryReferenceRewardDistanceBucket,
  classifyEntryReferenceRiskDistanceBucket,
  mapAuditGeometryToEntryReferenceQuality,
} from "../historical-entry-reference-quality-analysis";
import { HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION } from "../historical-entry-reference-quality-analysis-types";
import { ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS } from "../historical-entry-reference-quality-analysis-types";
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

function pipeline(lifecycle: IndependentTradeLifecycleReport) {
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
  const perf = buildHistoricalTheoreticalPerformanceReport({
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
    eligibilityAuditReport: audit,
    lifecycleReport: lifecycle,
  });
  const analysis = buildHistoricalEntryReferenceQualityAnalysis({
    lifecycleReport: lifecycle,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
    eligibilityAuditReport: audit,
    theoreticalPerformanceReport: perf,
  });
  return { stats, rStats, audit, perf, analysis };
}

describe("historical-entry-reference-quality-analysis", () => {
  it("A. schema version", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      analysis.schemaVersion,
      HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION
    );
  });

  it("B. canonical entry/target/invalidation source", () => {
    const t = trade({
      entryReferencePrice: 100,
      targetReferencePrice: 120,
      invalidationReferencePrice: 90,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const { analysis } = pipeline(baseLifecycle([t]));
    assert.equal(analysis.geometry.CONSISTENT_GEOMETRY.trades, 1);
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(computed.riskAmount, 10);
    assert.equal(computed.rewardAmount, 20);
  });

  it("C. bullish geometry", () => {
    const t = trade({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const g = classifyTheoreticalRGeometryForAudit(
      t,
      computeTheoreticalTradeRMultiple(t)
    );
    assert.equal(
      mapAuditGeometryToEntryReferenceQuality(g),
      "CONSISTENT_GEOMETRY"
    );
  });

  it("D. bearish geometry", () => {
    const t = trade({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 105,
      pathOutcome: "INVALIDATION_TOUCHED",
      policyClassification: "ADVERSE_RESOLUTION",
    });
    const g = classifyTheoreticalRGeometryForAudit(
      t,
      computeTheoreticalTradeRMultiple(t)
    );
    assert.equal(
      mapAuditGeometryToEntryReferenceQuality(g),
      "CONSISTENT_GEOMETRY"
    );
  });

  it("E. inconsistent geometry", () => {
    const t = trade({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 95,
      pathOutcome: "INVALIDATION_TOUCHED",
      policyClassification: "ADVERSE_RESOLUTION",
    });
    const g = classifyTheoreticalRGeometryForAudit(
      t,
      computeTheoreticalTradeRMultiple(t)
    );
    assert.equal(
      mapAuditGeometryToEntryReferenceQuality(g),
      "INCONSISTENT_TARGET_DIRECTION"
    );
  });

  it("F. invalid risk", () => {
    const t = trade({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 105,
      pathOutcome: "INVALIDATION_TOUCHED",
      policyClassification: "ADVERSE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    const g = classifyTheoreticalRGeometryForAudit(t, computed);
    const quality = mapAuditGeometryToEntryReferenceQuality(g);
    assert.ok(
      quality === "INVALID_RISK_REFERENCE" ||
        quality === "INCONSISTENT_TARGET_DIRECTION"
    );
    assert.ok(
      computed.rejectionReasons.includes("INVALID_RISK_REFERENCE") ||
        computed.rejectionReasons.includes("INCONSISTENT_TARGET_DIRECTION")
    );
  });

  it("G. prospective RR ≠ theoretical R", () => {
    const t = trade({
      canonicalRrRatio: 3,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(computed.prospectiveRrRatio, 3);
    assert.equal(computed.theoreticalR, 2);
    const { analysis } = pipeline(baseLifecycle([t]));
    assert.ok(analysis.prospectiveVsTheoreticalR.note.includes("Prospective"));
  });

  it("H. geometry × outcome", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "l",
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(analysis.geometry.CONSISTENT_GEOMETRY.wins, 1);
    assert.equal(analysis.geometry.CONSISTENT_GEOMETRY.losses, 1);
    assert.equal(analysis.geometry.CONSISTENT_GEOMETRY.decisive, 2);
  });

  it("I. geometry × evaluation", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          tradeEvaluationStatus: "PASSED",
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
        trade({
          tradeId: "f",
          tradeEvaluationStatus: "FAILED",
          pathOutcome: "INVALIDATION_TOUCHED",
          policyClassification: "ADVERSE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      analysis.evaluationCross.CONSISTENT_GEOMETRY.PASSED.decisive,
      1
    );
    assert.equal(
      analysis.evaluationCross.CONSISTENT_GEOMETRY.FAILED.decisive,
      1
    );
  });

  it("J. geometry × direction", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          direction: "BULLISH",
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.ok(analysis.directionCross.BULLISH.geometryDistribution.CONSISTENT_GEOMETRY >= 1);
  });

  it("K. geometry × RR", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          canonicalRrRatio: 2,
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.ok(
      analysis.rrCross.FROM_2_0_TO_3_0.geometryDistribution.CONSISTENT_GEOMETRY >=
        1
    );
  });

  it("L. invalid geometry audit style", () => {
    const t = trade({
      direction: "BEARISH",
      invalidationReferencePrice: 95,
      targetReferencePrice: 90,
      pathOutcome: "INVALIDATION_TOUCHED",
      policyClassification: "ADVERSE_RESOLUTION",
    });
    const { analysis, audit } = pipeline(baseLifecycle([t]));
    assert.equal(audit.decisiveParity.decisiveWithoutTheoreticalR, 1);
    assert.equal(analysis.invalidGeometry.summary.unavailableCount, 1);
    assert.equal(analysis.overall.wins, 0);
    assert.equal(analysis.overall.losses, 1);
  });

  it("M. duration cross", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          lifecycleDurationBars: 2,
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.ok(
      analysis.durationCross.DURATION_1_3.geometryDistribution.CONSISTENT_GEOMETRY >=
        1
    );
  });

  it("N. sample quality", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          pathOutcome: "TARGET_TOUCHED",
          policyClassification: "FAVORABLE_RESOLUTION",
        }),
      ])
    );
    assert.equal(
      analysis.geometry.CONSISTENT_GEOMETRY.sampleSizeQuality,
      "VERY_SMALL_SAMPLE"
    );
  });

  it("O. zero denominator", () => {
    const { analysis } = pipeline(
      baseLifecycle([
        trade({
          pathOutcome: "NO_TOUCH",
          policyClassification: "UNRESOLVED_AT_HORIZON",
        }),
      ])
    );
    assert.equal(analysis.geometry.CONSISTENT_GEOMETRY.winRate_decisive.value, null);
  });

  it("P. deterministic repeated analysis", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const a = pipeline(lifecycle).analysis;
    const b = pipeline(lifecycle).analysis;
    assert.deepEqual(a, b);
  });

  it("Q. immutability", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const before = JSON.stringify(lifecycle);
    pipeline(lifecycle);
    assert.equal(JSON.stringify(lifecycle), before);
  });

  it("R. risk/reward buckets descriptive", () => {
    assert.equal(classifyEntryReferenceRiskDistanceBucket(0.002), "TIGHT_RISK");
    assert.equal(classifyEntryReferenceRewardDistanceBucket(null), "NOT_APPLICABLE");
  });

  it("S. architecture consume pattern in tests", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-entry-reference-quality-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEntryReferenceQualityAnalysis"));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("runRealHistoricalBacktest"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetch("));
  });

  it("T. real BTC pipeline integration", async () => {
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
    const rBefore = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rBefore,
    });
    const perfBefore = buildHistoricalTheoreticalPerformanceReport({
      statisticsReport: stats,
      rMultipleStatisticsReport: rBefore,
      eligibilityAuditReport: audit,
      lifecycleReport: lifecycle,
    });
    buildHistoricalEntryReferenceQualityAnalysis({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
      rMultipleStatisticsReport: rBefore,
      eligibilityAuditReport: audit,
      theoreticalPerformanceReport: perfBefore,
    });
    const rAfter = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
      statisticsReport: stats,
    });
    assert.equal(rAfter.overall.sumR, rBefore.overall.sumR);
    assert.equal(rAfter.overall.expectancyR, rBefore.overall.expectancyR);
    assert.equal(
      stats.overall.counts.wins,
      rBefore.overall.wins
    );
    if (
      lifecycle.summary.independentTrades === 340 &&
      stats.overall.counts.decisiveResolutions === 285
    ) {
      assert.equal(audit.decisiveParity.decisiveWithoutTheoreticalR, 16);
      assert.equal(
        audit.geometryDistribution.INCONSISTENT_TARGET_DIRECTION,
        16
      );
    }
  });

  it("geometry rows cover all qualities", () => {
    assert.equal(ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.length, 4);
  });
});
