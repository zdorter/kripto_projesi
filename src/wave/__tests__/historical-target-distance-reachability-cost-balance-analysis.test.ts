import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalEntryPriceMoveQualityAnalysis } from "../historical-entry-price-move-quality-analysis";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import { buildHistoricalTargetDistanceStructuralContextAnalysis } from "../historical-target-distance-structural-context-analysis";
import {
  buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis,
  targetBandToRewardBucket,
} from "../historical-target-distance-reachability-cost-balance-analysis";
import { HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION } from "../historical-target-distance-reachability-cost-balance-analysis-types";
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
  const b12y = buildHistoricalTargetDistanceStructuralContextAnalysis({
    lifecycleReport,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    displacementEqualityTargetMechanicsAnalysisReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
    alternativeTargetModelAnalysisReport: b12v,
  });
  const b12r = buildHistoricalEntryPriceMoveQualityAnalysis({
    lifecycleReport,
    eligibilityAuditReport,
  });
  return {
    lifecycleReport,
    eligibilityAuditReport,
    b12w,
    b12x,
    b12t,
    b12u,
    b12v,
    b12y,
    b12r,
  };
}

describe("historical-target-distance-reachability-cost-balance-analysis (B-12z)", () => {
  it("A. schema and band mapping", () => {
    assert.equal(
      HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION,
      "1.0"
    );
    assert.equal(targetBandToRewardBucket("TARGET_LT_0_10"), "REWARD_LT_0_10");
  });

  it("B. frozen population", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      structuralContextAnalysisReport: pipe.b12y,
      entryPriceMoveQualityAnalysisReport: pipe.b12r,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.canonicalReplayClassifiable, 320);
    assert.equal(report.targetDistanceBalanceTable.length, 7);
  });

  it("C. B-12w reach parity", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const totalReached = report.targetDistanceBalanceTable.reduce(
      (s, r) => s + r.targetReached,
      0
    );
    const canon = pipe.b12w.modelResults.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    assert.equal(totalReached, canon.targetReached);
  });

  it("D. B-12x cost parity at 0.20%", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    const covered = report.targetDistanceBalanceTable.reduce(
      (s, r) =>
        s +
        (r.costCoverageAt0_20 ?? 0) *
          r.targetReached,
      0
    );
    const b12xCanon = pipe.b12x.modelResults.find(
      (m) =>
        m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && m.roundTripCostPercentage === 0.2
    )!;
    assert.ok(Math.abs(covered - b12xCanon.costCoveredTargetCount) < 1e-6);
  });

  it("E–H. balance table, cost matrix, MFE, Wilson", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.costSensitivityMatrix.length === 7);
    assert.ok(report.mfeAnalysis.length === 7);
    assert.equal(
      report.targetDistanceBalanceTable[0]!.reachRateWilson95.method,
      "WILSON_SCORE_INTERVAL"
    );
    assert.ok(report.balanceAnalysis.length === 7);
  });

  it("I–L. crosses and theoretical R", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.ok(report.targetDistanceByHeadroom.length > 0);
    assert.ok(report.theoreticalRByBand.length === 7);
    assert.ok(report.anchorSourceCoverageNote.includes("MIXED"));
    assert.ok(report.evaluatorByTargetBand.some((e) => e.failureReason === "RR_BELOW_MINIMUM"));
  });

  it("M–P. small/large cohorts and examples", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(report.smallTargetAnalysis.length, 3);
    assert.equal(report.largeTargetAnalysis.length, 5);
    assert.ok(report.largeTargetAnalysis.filter((l) => l.trades > 0).every((l) => l.b12wReachParity));
    assert.equal(report.failedFavorableByBand.reduce((s, f) => s + f.trades, 0), 97);
    assert.ok(report.tradeExamples.length >= 30);
    assert.ok(report.diagnosticSummary.length === 12);
  });

  it("Q. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    };
    assert.deepEqual(
      buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis(input),
      buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis(input)
    );
  });

  it("R. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({ w: pipe.b12w, x: pipe.b12x, a: pipe.eligibilityAuditReport });
    buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
      alternativeTargetModelAnalysisReport: pipe.b12v,
    });
    assert.equal(
      JSON.stringify({ w: pipe.b12w, x: pipe.b12x, a: pipe.eligibilityAuditReport }),
      before
    );
  });

  it("S. architecture guard CO", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-target-distance-reachability-cost-balance-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis"));
    assert.ok(!mod.includes("computeTheoreticalTradeRMultiple"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
  });
});
