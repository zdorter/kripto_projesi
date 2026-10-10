import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import {
  buildHistoricalTargetDistanceStructuralContextAnalysis,
  classifyContextHeadroomBucket,
  classifyDisplacementContextBucket,
  classifyTargetDistanceAggregateBand,
  resolveDurationBucket,
} from "../historical-target-distance-structural-context-analysis";
import { HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION } from "../historical-target-distance-structural-context-analysis-types";
import { classifyPriceMoveRewardBucket } from "../historical-entry-price-move-quality-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

function frozenStack() {
  const candles = loadBtcusdt1hResearchFrozenDatasetV1().candles;
  const range = resolveRealHistoricalBacktestEvaluationRange(3000, 24);
  const result = runFrozenHistoricalBacktest({
    horizonBars: 24,
    startEvaluationBar: range.startEvaluationBar,
    endEvaluationBar: range.endEvaluationBar,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    candles,
  });
  const lifecycleReport = buildIndependentTradeLifecycleReport({
    report: result.report,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  });
  const eligibilityAuditReport = auditIndependentTradeTheoreticalREligibility({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  const b12v = buildHistoricalAlternativeTargetModelAnalysis({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  const b12w = buildHistoricalAlternativeTargetReachabilityReplay({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
    candles,
    alternativeTargetModelAnalysisReport: b12v,
  });
  const b12x = buildHistoricalCostAwareCounterfactualAnalysis({
    lifecycleReport,
    reachabilityReplayReport: b12w,
    alternativeTargetModelAnalysisReport: b12v,
    eligibilityAuditReport,
  });
  const b12t = buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
    lifecycleReport,
    eligibilityAuditReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  const b12u = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  return { lifecycleReport, b12w, b12x, b12t, b12u, b12v };
}

describe("historical-target-distance-structural-context-analysis (B-12y)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION, "1.0");
  });

  it("B. bucket classifiers", () => {
    assert.equal(classifyPriceMoveRewardBucket(0.05), "REWARD_LT_0_10");
    assert.equal(classifyTargetDistanceAggregateBand(0.3), "AGG_0_25_TO_0_50");
    assert.equal(classifyContextHeadroomBucket(0), "NO_HEADROOM");
    assert.equal(classifyContextHeadroomBucket(2.5), "HEADROOM_GTE_2_00");
    assert.equal(classifyDisplacementContextBucket(1.2), "DISP_1_00_TO_2_00");
    assert.equal(resolveDurationBucket(5), "DURATION_4_6");
  });

  it("C. frozen population", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.canonicalReplayClassifiable, 320);
    assert.equal(report.population.canonicalNotReplayable, 16);
  });

  it("D–H. target distance and displacement sections", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.targetDistanceFindings.byRewardBucket.length >= 7);
    assert.ok(report.displacementFindings.length > 0);
    assert.ok(report.structuralHeadroomFindings.length > 0);
    assert.ok(report.anchorSourceFindings.length > 0);
    assert.ok(report.anchorByTargetDistance.length > 0);
  });

  it("I–M. crosses wave family duration evaluator path", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.targetDistanceByHeadroom.length > 0);
    assert.ok(report.targetDistanceByDuration.length > 0);
    assert.ok(report.waveFindings.length > 0);
    assert.ok(report.setupFamilyFindings.length > 0);
    assert.ok(report.evaluatorFindings.some((e) => e.failureReason === "RR_BELOW_MINIMUM"));
    assert.ok(report.pathOutcomeFindings.length > 0);
  });

  it("N. cost findings and B-12x parity slice", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.costFindings.length, 4);
    const b12xCanon02 = pipe.b12x.modelResults.find(
      (m) =>
        m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && m.roundTripCostPercentage === 0.2
    )!;
    const yAll = report.targetDistanceFindings.byRewardBucket.reduce(
      (s, b) => s + b.costCoveredAt0_20,
      0
    );
    assert.equal(yAll, b12xCanon02.costCoveredTargetCount);
  });

  it("O. large targets", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.largeTargetFindings.length, 5);
  });

  it("P–Q. cohorts FAILED+FAVORABLE and PASSED+ADVERSE", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("R. Wilson CI on reach slice", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const row = report.targetDistanceFindings.byRewardBucket.find(
      (b) => b.bucket === "REWARD_GTE_3_00"
    )!;
    assert.equal(row.reachRateWilson95.method, "WILSON_SCORE_INTERVAL");
    assert.ok(row.reachRateWilson95.lower !== null);
  });

  it("S. direct vs associational", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.directVsAssociational.directMeasurements.length > 0);
    assert.ok(report.diagnosticSummary.length >= 10);
  });

  it("T. trade examples", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.tradeExamples.length >= 20);
    assert.ok(report.tradeExamples.every((e) => e.tradeId.length > 0));
  });

  it("U. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    };
    assert.deepEqual(
      buildHistoricalTargetDistanceStructuralContextAnalysis(input),
      buildHistoricalTargetDistanceStructuralContextAnalysis(input)
    );
  });

  it("V. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      w: pipe.b12w,
      x: pipe.b12x,
      t: pipe.b12t,
      u: pipe.b12u,
    });
    buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(
      JSON.stringify({ w: pipe.b12w, x: pipe.b12x, t: pipe.b12t, u: pipe.b12u }),
      before
    );
  });

  it("W. architecture guard CN", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-target-distance-structural-context-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalTargetDistanceStructuralContextAnalysis"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
  });

  it("X. B-12w reach preserved in aggregate", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceStructuralContextAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const totalReached = report.targetDistanceFindings.byRewardBucket.reduce(
      (s, b) => s + b.targetReached,
      0
    );
    const canon = pipe.b12w.modelResults.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    assert.equal(totalReached, canon.targetReached);
  });
});
