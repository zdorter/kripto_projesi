import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import {
  buildHistoricalEntryContextFutureMoveAnalysis,
  classifyFutureMoveOutcomeBucket,
  classifyMovementOutcome,
  classifyProspectiveRrBucket,
  measureFutureMaximumFavorableExcursion,
} from "../historical-entry-context-future-move-analysis";
import { HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION } from "../historical-entry-context-future-move-analysis-types";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

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
  const b13 = buildHistoricalEntryContextTargetResearch({
    lifecycleReport,
    artifactMeasurements: result.report.artifact.measurements,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    eligibilityAuditReport,
    historicalDisplacementEqualityTargetMechanicsAnalysisReport: b12t,
    historicalStructuralExtremeVsDisplacementTargetAnalysisReport: b12u,
  });
  return {
    lifecycleReport,
    candles,
    eligibilityAuditReport,
    b12w,
    b12x,
    b12t,
    b12u,
    b13,
  };
}

function buildReport(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalEntryContextFutureMoveAnalysis({
    lifecycleReport: pipe.lifecycleReport,
    candles: pipe.candles,
    reachabilityReplayReport: pipe.b12w,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    entryContextTargetResearchReport: pipe.b13,
    displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
  });
}

describe("historical-entry-context-future-move-analysis (B-14)", () => {
  it("A–G. MFE calculation and buckets", () => {
    assert.equal(HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION, "1.0");
    assert.equal(classifyFutureMoveOutcomeBucket(0.5), "FUTURE_MOVE_LT_1");
    assert.equal(classifyFutureMoveOutcomeBucket(2.5), "FUTURE_MOVE_2_TO_3");
    assert.equal(classifyProspectiveRrBucket(1.2), "RR_1_TO_1_5");
    const candles = [
      { open: 100, high: 100, low: 100, close: 100, volume: 1, time: 0 },
      { open: 100, high: 110, low: 95, close: 108, volume: 1, time: 1 },
      { open: 108, high: 112, low: 107, close: 111, volume: 1, time: 2 },
    ];
    const bull = measureFutureMaximumFavorableExcursion({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      candles,
      horizonBars: 24,
    });
    assert.ok(bull.mfePercentage !== null && bull.mfePercentage > 9);
    assert.equal(bull.barsToMfePeak, 2);
    const bear = measureFutureMaximumFavorableExcursion({
      direction: "BEARISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      candles: [
        { open: 100, high: 105, low: 100, close: 100, volume: 1, time: 0 },
        { open: 100, high: 101, low: 88, close: 90, volume: 1, time: 1 },
      ],
      horizonBars: 24,
    });
    assert.ok(bear.mfePercentage !== null && bear.mfePercentage >= 11);
    assert.equal(
      classifyMovementOutcome("NOT_REACHED_WITHIN_HORIZON", 1.5, 1),
      "TARGET_NOT_REACHED_MFE_GTE_TARGET"
    );
    assert.equal(classifyFutureMoveOutcomeBucket(2.99), "FUTURE_MOVE_2_TO_3");
    assert.equal(classifyFutureMoveOutcomeBucket(3), "FUTURE_MOVE_3_TO_5");
  });

  it("D–E. horizon boundary; E bar excluded", () => {
    const candles = [
      { open: 100, high: 200, low: 90, close: 100, volume: 1, time: 0 },
      { open: 100, high: 101, low: 99, close: 100, volume: 1, time: 1 },
    ];
    const r = measureFutureMaximumFavorableExcursion({
      direction: "BULLISH",
      evaluationBarIndex: 0,
      entryPrice: 100,
      candles,
      horizonBars: 1,
    });
    assert.ok(r.mfePercentage !== null && r.mfePercentage < 2);
  });

  it("F. GTE threshold boundary", () => {
    assert.equal(classifyFutureMoveOutcomeBucket(0.999), "FUTURE_MOVE_LT_1");
    assert.equal(classifyFutureMoveOutcomeBucket(1), "FUTURE_MOVE_1_TO_2");
  });

  it("T. frozen BTC integration", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.canonicalReplayClassifiable, 320);
    assert.equal(report.population.canonicalNotReplayable, 16);
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles), FIXTURE_CHECKSUM);
  });

  it("H–L. required cross-tabs", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.displacementCross.length > 0);
    assert.ok(report.headroomCross.length === 4);
    assert.ok(report.targetDistanceCross.length > 0);
    assert.ok(report.structuralMoveCross.length > 0);
    assert.ok(report.prospectiveRrCross.length === 3);
  });

  it("M–N. FAILED+FAVORABLE and PASSED+ADVERSE", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("O–P. Wilson and sample quality", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.gtePopulationThresholds[0]!.wilson95.method, "WILSON_SCORE_INTERVAL");
    assert.ok(report.displacementCross.every((r) => r.sampleSizeQuality.length > 0));
  });

  it("Q. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      candles: pipe.candles,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      entryContextTargetResearchReport: pipe.b13,
      displacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalEntryContextFutureMoveAnalysis(input),
      buildHistoricalEntryContextFutureMoveAnalysis(input)
    );
  });

  it("R. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      l: pipe.lifecycleReport,
      c: pipe.candles.length,
      w: pipe.b12w,
      x: pipe.b12x,
      h: pipe.eligibilityAuditReport,
      b13: pipe.b13,
    });
    buildReport(pipe);
    assert.equal(
      JSON.stringify({
        l: pipe.lifecycleReport,
        c: pipe.candles.length,
        w: pipe.b12w,
        x: pipe.b12x,
        h: pipe.eligibilityAuditReport,
        b13: pipe.b13,
      }),
      before
    );
  });

  it("S. lookahead attestation", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.lookaheadAttestation.entryContextUsesAnchorToEOnly, true);
    assert.equal(report.lookaheadAttestation.postEUsedForFutureOutcomesOnly, true);
  });

  it("B-12w reach parity", () => {
    const pipe = frozenStack();
    const report = buildReport(pipe);
    const canon = pipe.b12w.modelResults.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    assert.equal(report.reachVsMfe.targetReached, canon.targetReached);
  });

  it("B-12h theoretical R sum unchanged", () => {
    const pipe = frozenStack();
    const auditSum = pipe.eligibilityAuditReport.decisiveRows
      .filter((r) => r.theoreticalREligible && r.theoreticalR !== null)
      .reduce((s, r) => s + r.theoreticalR!, 0);
    buildReport(pipe);
    const afterSum = pipe.eligibilityAuditReport.decisiveRows
      .filter((r) => r.theoreticalREligible && r.theoreticalR !== null)
      .reduce((s, r) => s + r.theoreticalR!, 0);
    assert.ok(Math.abs(auditSum - afterSum) < 1e-9);
  });

  it("reach vs MFE distinction", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.reachVsMfe.mfeGteTargetNotReached > 0);
  });

  it("U. architecture guard module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-future-move-analysis.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEntryContextFutureMoveAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("buildHistoricalDisplacementEqualityTargetMechanicsAnalysis"));
    assert.ok(!mod.includes("fetch("));
  });

  it("diagnostic 18 questions", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.diagnosticSummary.length, 18);
    assert.ok(report.tradeExamples.length >= 30);
    assert.equal(report.thresholdAnalysis.length, 9);
    assert.ok(report.perTrade.length > 0);
    assert.ok(report.mfeBeyondTargetWithoutCanonicalTouch.trades > 0);
    assert.equal(report.horizon.horizonBars, 24);
  });

  it("headroom GTE delta", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.headroomPresenceComparison.present.gte3.rate !== null);
    assert.ok(report.headroomPresenceComparison.absent.gte3.rate !== null);
  });
});
