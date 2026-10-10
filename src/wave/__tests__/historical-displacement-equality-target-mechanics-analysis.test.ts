import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import {
  HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION,
} from "../historical-displacement-equality-target-mechanics-analysis-types";
import { buildHistoricalEntryPriceMoveQualityAnalysis } from "../historical-entry-price-move-quality-analysis";
import { buildHistoricalEvaluatorFailureReasonAnalysis } from "../historical-evaluator-failure-reason-analysis";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { projectProspectiveOpenLegDisplacementEqualityTarget } from "../setup/prospective-open-leg-displacement-equality-policy";
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
    pathOutcome: patch.pathOutcome ?? "TARGET_TOUCHED",
    policyClassification: patch.policyClassification ?? "FAVORABLE_RESOLUTION",
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 12,
    resolutionBarIndex: 12,
    barsAfterEvaluation: 2,
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 2,
  };
}

function frozenStack() {
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
  const b12n = buildHistoricalEvaluatorFailureReasonAnalysis({
    lifecycleReport,
  });
  const b12r = buildHistoricalEntryPriceMoveQualityAnalysis({
    lifecycleReport,
    eligibilityAuditReport: audit,
    rrThresholdTheoreticalRAnalysisReport: b12p,
  });
  return { result, lifecycleReport, stats, rStats, audit, b12p, b12n, b12r };
}

describe("historical-displacement-equality-target-mechanics-analysis (B-12t)", () => {
  it("A. schema", () => {
    assert.equal(
      HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION,
      "1.0"
    );
  });

  it("B. empty report", () => {
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [],
        entryRejections: [],
      },
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
      artifactMeasurements: [],
    });
    assert.equal(report.population.independentTrades, 0);
    assert.equal(report.targetFormula.functionName, "projectProspectiveOpenLegDisplacementEqualityTarget");
  });

  it("C–F. formula source and bullish/bearish math", () => {
    assert.equal(projectProspectiveOpenLegDisplacementEqualityTarget(100, 120), 140);
    assert.equal(projectProspectiveOpenLegDisplacementEqualityTarget(128, 115), 102);
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 105,
            targetReferencePrice: 110,
          }),
        ],
        entryRejections: [],
      },
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
      artifactMeasurements: [
        {
          snapshotId: "snap:t1",
          evaluation: {
            production: {
              openLegResolution: {
                leg: {
                  anchorPrice: 100,
                  anchorIndex: 5,
                  observationSpanBars: 5,
                  observedDirection: "BULLISH",
                  selectedAnchorSources: ["CONFIRMED_SWING"],
                },
              },
            },
          } as never,
        } as never,
      ],
    });
    assert.equal(report.formulaMismatches.length, 0);
    assert.equal(report.displacementEquality.exactEqualityCount, 1);
    assert.equal(report.targetMagnitude.perTrade[0]!.displacementRatio, 1);
  });

  it("G. anchor provenance rows", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.anchorAnalysis.rows.some((r) => r.evidence === "DIRECT"));
    assert.ok(report.anchorAnalysis.isAnchorSwingPrice.includes("CONFIRMED_SWING"));
  });

  it("H. open leg definition", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.openLegAnalysis.definitionSourceModule, "setup/open-structural-leg.ts");
    assert.equal(report.openLegAnalysis.answers.length, 8);
  });

  it("I–J. displacement equality and formula vs canonical on frozen BTC", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.population.independentTrades, pipe.lifecycleReport.trades.length);
    assert.equal(report.targetFormula.mismatchCount, 0);
    assert.equal(report.displacementEquality.mismatchCount, 0);
    assert.ok(report.displacementEquality.equalityRatioMedian !== null);
    assert.ok(Math.abs(report.displacementEquality.equalityRatioMedian! - 1) < 1e-4);
  });

  it("K–L. target magnitude and large move buckets", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(Object.keys(report.targetMagnitude.rewardBucketCounts).length > 0);
    if (report.largeMoveContext.canonicalGte3Count === 0) {
      assert.ok(report.largeMoveContext.emptyBucketNotes.some((n) => n.includes("3%")));
    }
  });

  it("M. structural comparison", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.structuralComparison.tradesWithStructuralBeyondCanonical >= 0);
  });

  it("N. wave context", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.waveContext.length > 0);
  });

  it("O. Fibonacci audit", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.fibonacciAudit.fibonacciInCanonicalTargetFormula, false);
    assert.ok(report.fibonacciAudit.statement.includes("not part"));
  });

  it("P. reward vs displacement", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.rewardVsDisplacement.deterministicOneToOneWhenFormulaValid, true);
    const corr = report.rewardVsDisplacement.pearsonCorrelationAnchorEntryPctToRewardPct;
    assert.ok(corr === null || corr > 0.99);
  });

  it("Q. displacement vs RR", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.displacementVsRR.some((r) => r.displacementRatioBucket === "RATIO_NEAR_1"));
  });

  it("R. FAILED + WIN slice", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      historicalEvaluatorFailureReasonAnalysisReport: pipe.b12n,
    });
    assert.ok(report.failedWinAnalysis.failedFavorableCount > 0);
    assert.ok(report.failedWinAnalysis.rrBelowMinimumCount > 0);
    assert.equal(report.consumedReports.historicalEvaluatorFailureReasonAnalysisReport, true);
  });

  it("S. examples", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.examples.normal.length >= 10);
    assert.equal(report.examples.smallReward.length, 5);
    assert.equal(report.examples.largeReward.length, 5);
  });

  it("T. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    };
    assert.deepEqual(
      buildHistoricalDisplacementEqualityTargetMechanicsAnalysis(input),
      buildHistoricalDisplacementEqualityTargetMechanicsAnalysis(input)
    );
  });

  it("U. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      lc: pipe.lifecycleReport,
      audit: pipe.audit,
      b12p: pipe.b12p,
      b12r: pipe.b12r,
      stats: pipe.stats,
    });
    buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(
      JSON.stringify({
        lc: pipe.lifecycleReport,
        audit: pipe.audit,
        b12p: pipe.b12p,
        b12r: pipe.b12r,
        stats: pipe.stats,
      }),
      before
    );
  });

  it("V. lookahead", () => {
    const pipe = frozenStack();
    const report = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.lookaheadAttestation.noFutureBarReferenceSynthesis, true);
  });

  it("W. architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-displacement-equality-target-mechanics-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalDisplacementEqualityTargetMechanicsAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("fetch("));
  });

  it("X. frozen BTC integration parity", () => {
    const pipe = frozenStack();
    const statsBefore = JSON.stringify(pipe.stats.overall);
    const auditGeomBefore = pipe.audit.geometryDistribution;
    const b12pBefore = JSON.stringify(pipe.b12p.prospectiveBandComparison);
    const b12rBefore = JSON.stringify(pipe.b12r.metricDefinitions);
    buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(JSON.stringify(pipe.stats.overall), statsBefore);
    assert.deepEqual(pipe.audit.geometryDistribution, auditGeomBefore);
    assert.equal(JSON.stringify(pipe.b12p.prospectiveBandComparison), b12pBefore);
    assert.equal(JSON.stringify(pipe.b12r.metricDefinitions), b12rBefore);
  });
});
