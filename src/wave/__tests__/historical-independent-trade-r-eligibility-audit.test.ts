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
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import {
  auditIndependentTradeTheoreticalREligibility,
  classifyTheoreticalRGeometryForAudit,
} from "../historical-independent-trade-r-eligibility-audit";
import { computeTheoreticalTradeRMultiple } from "../historical-independent-trade-r-multiple-statistics";
import { HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION } from "../historical-independent-trade-r-eligibility-audit-types";
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
    setupFamilyId: "FAM",
    tradeEvaluationStatus: "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome,
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 13,
    resolutionBarIndex: 13,
    barsAfterEvaluation: 3,
    lifecycleDurationBars: 3,
  };
}

describe("historical-independent-trade-r-eligibility-audit", () => {
  it("A. valid bullish geometry", () => {
    const t = trade({
      direction: "BULLISH",
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(
      classifyTheoreticalRGeometryForAudit(t, computed),
      "VALID_BULLISH_GEOMETRY"
    );
  });

  it("B. valid bearish geometry", () => {
    const t = trade({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 105,
      pathOutcome: "INVALIDATION_TOUCHED",
      policyClassification: "ADVERSE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(
      classifyTheoreticalRGeometryForAudit(t, computed),
      "VALID_BEARISH_GEOMETRY"
    );
  });

  it("C. invalid risk", () => {
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
    assert.ok(
      g === "INCONSISTENT_TARGET_DIRECTION" || g === "INVALID_RISK_REFERENCE"
    );
  });

  it("D. inconsistent target direction", () => {
    const t = trade({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 98,
      invalidationReferencePrice: 95,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(
      classifyTheoreticalRGeometryForAudit(t, computed),
      "INCONSISTENT_TARGET_DIRECTION"
    );
  });

  it("E. invalid direction", () => {
    const t = {
      ...trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      direction: null,
    };
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(
      classifyTheoreticalRGeometryForAudit(t, computed),
      "INVALID_DIRECTION"
    );
  });

  it("F. invalid price", () => {
    const t = trade({
      entryReferencePrice: -1,
      pathOutcome: "TARGET_TOUCHED",
      policyClassification: "FAVORABLE_RESOLUTION",
    });
    const computed = computeTheoreticalTradeRMultiple(t);
    assert.equal(
      classifyTheoreticalRGeometryForAudit(t, computed),
      "INVALID_PRICE_REFERENCE"
    );
  });

  it("G. decisive without R", () => {
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
    const report = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    });
    assert.equal(report.decisiveParity.decisiveTrades, 1);
    assert.equal(report.decisiveParity.validTheoreticalRTrades, 0);
    assert.equal(report.decisiveParity.decisiveWithoutTheoreticalR, 1);
    assert.ok(report.decisiveParity.parityInvariantHolds);
  });

  it("H. WIN + invalid geometry remains WIN", () => {
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
    const row = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    }).decisiveRows[0]!;
    assert.equal(row.observedWin, true);
    assert.equal(row.pathOutcome, "TARGET_TOUCHED");
    assert.equal(row.policyClassification, "FAVORABLE_RESOLUTION");
    assert.equal(row.theoreticalREligible, false);
  });

  it("I. LOSS + invalid geometry remains LOSS", () => {
    const lifecycle = baseLifecycle([
      trade({
        direction: "BEARISH",
        entryReferencePrice: 100,
        targetReferencePrice: 90,
        invalidationReferencePrice: 95,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const row = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    }).decisiveRows[0]!;
    assert.equal(row.observedLoss, true);
    assert.equal(row.theoreticalREligible, false);
  });

  it("J. canonical RR vs derived RR", () => {
    const lifecycle = baseLifecycle([
      trade({
        canonicalRrRatio: 2,
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const row = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    }).decisiveRows[0]!;
    assert.equal(row.derivedProspectiveRrFromPrices, 2);
    assert.equal(row.canonicalRrWithinTolerance, true);
  });

  it("K. deterministic audit", () => {
    const lifecycle = baseLifecycle([
      trade({
        tradeId: "a",
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
      trade({
        tradeId: "b",
        evaluationBarIndex: 11,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      }),
    ]);
    const a = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    });
    const b = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
    });
    assert.deepEqual(a, b);
  });

  it("L. input immutability", () => {
    const lifecycle = baseLifecycle([
      trade({
        pathOutcome: "TARGET_TOUCHED",
        policyClassification: "FAVORABLE_RESOLUTION",
      }),
    ]);
    const before = JSON.stringify(lifecycle);
    auditIndependentTradeTheoreticalREligibility({ lifecycleReport: lifecycle });
    assert.equal(JSON.stringify(lifecycle), before);
  });

  it("M. parity invariant with B-12g", () => {
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
    const rStats = aggregateIndependentTradeRMultipleStatistics({
      lifecycleReport: lifecycle,
    });
    const audit = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: lifecycle,
      rMultipleStatisticsReport: rStats,
    });
    assert.equal(
      audit.decisiveParity.validTheoreticalRTrades,
      rStats.overall.tradesWithTheoreticalR
    );
    assert.ok(audit.decisiveParity.parityInvariantHolds);
  });

  it("N. no silent repair in module", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-independent-trade-r-eligibility-audit.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("auditIndependentTradeTheoreticalREligibility"));
    assert.ok(!/\btrade\.entryReferencePrice\s*=(?!=)/.test(mod));
    assert.ok(!/\btrade\.targetReferencePrice\s*=(?!=)/.test(mod));
    assert.ok(!/\btrade\.invalidationReferencePrice\s*=(?!=)/.test(mod));
    assert.ok(!/\btrade\.policyClassification\s*=(?!=)/.test(mod));
    assert.ok(!/\btrade\.direction\s*=(?!=)/.test(mod));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetch("));
  });

  it("schema version", () => {
    const report = auditIndependentTradeTheoreticalREligibility({
      lifecycleReport: baseLifecycle([]),
    });
    assert.equal(
      report.schemaVersion,
      HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION
    );
    assert.equal(report.samples.firstValidDecisiveTrades.length, 0);
    assert.equal(report.samples.firstInvalidDecisiveTrades.length, 0);
  });

  it("real BTC pipeline audit parity", async () => {
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
    assert.equal(audit.population.independentTrades, lifecycle.trades.length);
    assert.equal(
      audit.decisiveParity.decisiveTrades,
      stats.overall.counts.decisiveResolutions
    );
    assert.ok(audit.decisiveParity.parityInvariantHolds);
    assert.equal(
      audit.decisiveParity.decisiveWithoutTheoreticalR,
      rStats.overall.decisiveWithoutTheoreticalR
    );
    if (
      lifecycle.summary.independentTrades === 340 &&
      stats.overall.counts.decisiveResolutions === 285
    ) {
      assert.equal(stats.overall.counts.wins, 131);
      assert.equal(stats.overall.counts.losses, 154);
      assert.equal(
        audit.decisiveParity.decisiveWithoutTheoreticalR,
        rStats.overall.decisiveWithoutTheoreticalR
      );
      if (rStats.overall.decisiveWithoutTheoreticalR > 0) {
        assert.ok(
          audit.geometryDistribution.INCONSISTENT_TARGET_DIRECTION > 0 ||
            audit.geometryDistribution.INVALID_RISK_REFERENCE > 0 ||
            audit.geometryDistribution.INVALID_PRICE_REFERENCE > 0
        );
      }
    }
  });
});
