import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import {
  buildHistoricalEntryPriceMoveQualityAnalysis,
  classifyPriceMoveRewardBucket,
  classifyPriceMoveRiskBucket,
  computeGrossPriceMovePercentages,
} from "../historical-entry-price-move-quality-analysis";
import { HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION } from "../historical-entry-price-move-quality-analysis-types";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

function unit(
  patch: Partial<IndependentTradeUnit> & {
    direction: "BULLISH" | "BEARISH";
    pathOutcome: IndependentTradeUnit["pathOutcome"];
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
    evaluationBarIndex: patch.evaluationBarIndex ?? 10,
    evaluationBarTime: null,
    prospectiveSetupId: "p1",
    sourceSetupId: null,
    direction: patch.direction,
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 110,
    invalidationReferencePrice: patch.invalidationReferencePrice ?? 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: ["DISPLAY_PICK"],
    setupFamilyId: "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus ?? "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome,
    policyClassification: patch.policyClassification,
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 12,
    resolutionBarIndex: 12,
    barsAfterEvaluation: 2,
    lifecycleDurationBars: 2,
  };
}

function frozenPipeline() {
  const range = resolveRealHistoricalBacktestEvaluationRange(3000, 24);
  const result = runFrozenHistoricalBacktest({
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
  const rStats = aggregateIndependentTradeRMultipleStatistics({
    lifecycleReport,
    statisticsReport: stats,
  });
  const audit = auditIndependentTradeTheoreticalREligibility({
    lifecycleReport,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
  });
  const b12p = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
    lifecycleReport,
    eligibilityAuditReport: audit,
  });
  return { lifecycleReport, audit, b12p, stats, rStats };
}

describe("historical-entry-price-move-quality-analysis (B-12r)", () => {
  it("A. metric separation example", () => {
    const g = computeGrossPriceMovePercentages(
      unit({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 100.1,
        invalidationReferencePrice: 99,
        canonicalRrRatio: 0.1,
        pathOutcome: "NO_TOUCH",
        policyClassification: "UNRESOLVED_AT_HORIZON",
      })
    );
    assert.equal(g.geometryValidity, "VALID");
    assert.ok(Math.abs(g.grossRewardPercentage! - 0.1) < 1e-9);
    assert.ok(Math.abs(g.grossRiskPercentage! - 1) < 1e-9);
  });

  it("B. reward and risk bucket contracts", () => {
    assert.equal(classifyPriceMoveRewardBucket(0.05), "REWARD_LT_0_10");
    assert.equal(classifyPriceMoveRewardBucket(0.15), "REWARD_0_10_TO_0_25");
    assert.equal(classifyPriceMoveRewardBucket(null), "REWARD_NOT_APPLICABLE");
    assert.equal(classifyPriceMoveRiskBucket(0.2), "RISK_LT_0_25");
    assert.equal(classifyPriceMoveRiskBucket(4), "RISK_GTE_3_00");
  });

  it("C. RR parity with canonicalRrRatio", () => {
    const report = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 110,
            invalidationReferencePrice: 95,
            canonicalRrRatio: 2,
            pathOutcome: "TARGET_TOUCHED",
            policyClassification: "FAVORABLE_RESOLUTION",
          }),
        ],
        entryRejections: [],
      },
      eligibilityAuditReport: {
        schemaVersion: "1.0",
        decisiveRows: [],
      } as never,
    });
    assert.equal(report.rrValidationSummary.tradesWithBothPercentages, 1);
    assert.equal(report.rrValidationSummary.withinToleranceCount, 1);
  });

  it("D. invalid geometry flagged not dropped", () => {
    const g = computeGrossPriceMovePercentages(
      unit({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 99,
        invalidationReferencePrice: 95,
        pathOutcome: "INVALIDATION_TOUCHED",
        policyClassification: "ADVERSE_RESOLUTION",
      })
    );
    assert.equal(g.geometryValidity, "INVALID_TARGET_GEOMETRY");
    assert.equal(g.grossRewardPercentage, null);
  });

  it("E. frozen determinism", () => {
    const a = frozenPipeline();
    const r1 = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: a.lifecycleReport,
      eligibilityAuditReport: a.audit,
      rrThresholdTheoreticalRAnalysisReport: a.b12p,
    });
    const r2 = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: a.lifecycleReport,
      eligibilityAuditReport: a.audit,
      rrThresholdTheoreticalRAnalysisReport: a.b12p,
    });
    assert.deepEqual(r1, r2);
    assert.equal(r1.tradeExamples.length, 20);
  });

  it("F. immutability of upstream inputs", () => {
    const pipe = frozenPipeline();
    const before = JSON.stringify({
      lc: pipe.lifecycleReport,
      audit: pipe.audit,
      b12p: pipe.b12p,
    });
    buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(JSON.stringify({
      lc: pipe.lifecycleReport,
      audit: pipe.audit,
      b12p: pipe.b12p,
    }), before);
  });

  it("G. consumes B-12p prospectiveBandComparison without recomputing", () => {
    const pipe = frozenPipeline();
    const report = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(
      report.b12pProspectiveBandReference.enrichments.length,
      3
    );
    const lt = report.b12pProspectiveBandReference.enrichments.find(
      (e) => e.bandId === "RR_LT_1_0"
    )!;
    const b12pLt = pipe.b12p.prospectiveBandComparison.find(
      (r) => r.bandId === "RR_LT_1_0"
    )!;
    assert.deepEqual(lt.b12pMetrics, b12pLt);
  });

  it("H. FAILED + WIN section", () => {
    const pipe = frozenPipeline();
    const report = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
    });
    assert.ok(report.failedWinAnalysis.totalFailedWin > 0);
    for (const t of report.failedWinAnalysis.trades) {
      assert.equal(t.policyClassification, "FAVORABLE_RESOLUTION");
    }
  });

  it("I. warnings include fee and leverage", () => {
    const report = buildHistoricalEntryPriceMoveQualityAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [],
        entryRejections: [],
      },
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
    });
    assert.ok(
      report.warnings.some((w) => w.includes("gross_price_move_excludes"))
    );
    assert.ok(report.warnings.some((w) => w.includes("leverage_not_applied")));
  });

  it("J. architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-entry-price-move-quality-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEntryPriceMoveQualityAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!mod.includes("calculatePnL"));
  });

  it("K. schema version", () => {
    assert.equal(
      HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION,
      "1.0"
    );
  });
});
