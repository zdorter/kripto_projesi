import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import {
  assertReachabilityUnchanged,
  buildHistoricalCostAwareCounterfactualAnalysis,
  classifyCostMarginState,
  netCounterfactualRr,
  netRealizedRewardPercentage,
  netTargetMarginPercentage,
} from "../historical-cost-aware-counterfactual-analysis";
import {
  DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT,
  HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION,
} from "../historical-cost-aware-counterfactual-analysis-types";
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
  return { lifecycleReport, b12v, b12w };
}

describe("historical-cost-aware-counterfactual-analysis (B-12x)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION, "1.0");
  });

  it("B. population parity with B-12w", () => {
    const { lifecycleReport, b12v, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
      alternativeTargetModelAnalysisReport: b12v,
    });
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.b12wReachabilityParityVerified, true);
    assert.ok(report.population.notReplayableRows > 0);
  });

  it("C. default cost scenarios", () => {
    assert.deepEqual(DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT, [
      0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5,
    ]);
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.deepEqual(report.costScenarios, [...DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT]);
  });

  it("D. custom cost scenarios", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
      roundTripCostScenariosPercent: [0, 0.12],
    });
    assert.deepEqual(report.costScenarios, [0, 0.12]);
    assert.equal(report.modelResults.length, 11 * 2);
  });

  it("E–G. gross reward, risk, net margin arithmetic", () => {
    assert.equal(netTargetMarginPercentage(1, 0.2), 0.8);
    assert.equal(classifyCostMarginState(0.1, 0.1), "BREAK_EVEN_MARGIN");
    assert.equal(classifyCostMarginState(0.5, 0.2), "POSITIVE_GROSS_MARGIN");
    assert.equal(classifyCostMarginState(0.1, 0.2), "NET_NEGATIVE_MARGIN");
    assert.equal(netRealizedRewardPercentage("NOT_REACHED_WITHIN_HORIZON", 1, 0.1), null);
    assert.equal(netRealizedRewardPercentage("TARGET_REACHED", 1, 0.1), 0.9);
  });

  it("H–J. zero cost and break-even", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    const canon0 = report.modelResults.find(
      (m) =>
        m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && m.roundTripCostPercentage === 0
    )!;
    assert.equal(
      canon0.costCoveredTargetCount,
      canon0.targetReached
    );
    const canon02 = report.modelResults.find(
      (m) =>
        m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && m.roundTripCostPercentage === 0.2
    )!;
    assert.ok(canon02.negativeMarginTargetCount >= 0);
  });

  it("K. cost coverage states", () => {
    assert.equal(classifyCostMarginState(null, 0.1), "NOT_CLASSIFIABLE");
  });

  it("L–Q. displacement models reachability preserved", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    for (const id of [
      "CANONICAL_DISPLACEMENT_EQUALITY",
      "DISPLACEMENT_1_25",
      "DISPLACEMENT_1_50",
      "DISPLACEMENT_2_00",
      "DISPLACEMENT_2_50",
      "DISPLACEMENT_3_00",
    ] as const) {
      const b12wM = b12w.modelResults.find((m) => m.modelId === id)!;
      const x = report.modelResults.find(
        (m) => m.modelId === id && m.roundTripCostPercentage === 0
      )!;
      assert.equal(x.targetReached, b12wM.targetReached);
      assert.equal(x.classifiableTrades, b12wM.classifiableTrades);
    }
  });

  it("R. structural prefix model", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    const sp = b12w.modelResults.find((m) => m.modelId === "STRUCTURAL_PREFIX_EXTREME")!;
    const x = report.modelResults.find(
      (m) => m.modelId === "STRUCTURAL_PREFIX_EXTREME" && m.roundTripCostPercentage === 0
    )!;
    assert.equal(x.targetReachRate, sp.targetReachRate);
  });

  it("S–T. reachability and target-first preservation", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.ok(assertReachabilityUnchanged(b12w, report));
    const canon = b12w.modelResults.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY")!;
    assert.ok(Math.abs(canon.targetReachRate! - 0.4) < 0.02);
  });

  it("U. same-bar not classifiable for net realized", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const amb = b12w.perTrade.find((r) => r.replayEvent === "AMBIGUOUS_SAME_BAR");
    if (amb) {
      assert.equal(netRealizedRewardPercentage("AMBIGUOUS_SAME_BAR", 1, 0.1), null);
    }
  });

  it("V. insufficient future", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const row = b12w.perTrade.find((r) => r.replayEvent === "INSUFFICIENT_FUTURE");
    if (row) {
      assert.equal(netRealizedRewardPercentage(row.replayEvent, row.grossTargetMovePercentage, 0), null);
    }
  });

  it("W. FAILED+FAVORABLE cohort", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.ok(report.failedFavorableAnalysis.byModelAndCost.length > 0);
  });

  it("X. PASSED+ADVERSE cohort", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.ok(report.passedAdverseAnalysis.trades >= 0);
  });

  it("Y. reward buckets", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.ok(report.rewardBucketAnalysis.length > 0);
  });

  it("Z–AF. cross tabs and examples", () => {
    const { lifecycleReport, b12v, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
      alternativeTargetModelAnalysisReport: b12v,
    });
    assert.ok(report.rrCross.length > 0);
    assert.ok(report.directionCross.length > 0);
    assert.ok(report.setupFamilyCross.length > 0);
    assert.ok(report.waveContextCross.length > 0);
    assert.ok(report.anchorSourceCross.length > 0);
    assert.ok(report.evaluatorCross.length > 0);
    assert.ok(report.failureReasonCross.length > 0);
    assert.equal(report.arithmeticExamples.label, "ARITHMETIC_REFERENCE");
    assert.ok(report.arithmeticExamples.rows.length >= 6);
    assert.ok(report.costSensitivity.length === 11);
    assert.ok(report.warnings.includes("leverage_not_modeled"));
    assert.ok(report.warnings.includes("no_funding"));
    assert.ok(report.warnings.includes("no_slippage_model"));
  });

  it("AG. net counterfactual RR", () => {
    const rr = netCounterfactualRr("TARGET_REACHED", 1, 0.5, 0.2);
    assert.ok(rr !== null && Math.abs(rr - 0.8 / 0.7) < 1e-9);
    assert.equal(netCounterfactualRr("INVALIDATION_REACHED", 1, 0.5, 0.2), null);
  });

  it("AH. determinism", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const input = { lifecycleReport, reachabilityReplayReport: b12w };
    assert.deepEqual(
      buildHistoricalCostAwareCounterfactualAnalysis(input),
      buildHistoricalCostAwareCounterfactualAnalysis(input)
    );
  });

  it("AI. immutability", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const before = JSON.stringify(b12w);
    buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.equal(JSON.stringify(b12w), before);
  });

  it("AJ. architecture guard CM", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-cost-aware-counterfactual-analysis.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalCostAwareCounterfactualAnalysis"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("AK. B-12w parity classifiable 320", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const canon = b12w.modelResults.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY")!;
    assert.equal(canon.classifiableTrades, 320);
    assert.equal(canon.notReplayable, 16);
  });

  it("AL. no theoretical R in module outputs", () => {
    const { lifecycleReport, b12w } = frozenStack();
    const report = buildHistoricalCostAwareCounterfactualAnalysis({
      lifecycleReport,
      reachabilityReplayReport: b12w,
    });
    assert.ok(
      report.modelResults.every((m) => !Object.prototype.hasOwnProperty.call(m, "theoreticalR"))
    );
    assert.ok(report.canonicalReference.theoreticalRReference.includes("does not recompute"));
  });
});
