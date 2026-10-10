import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalEntryContextFutureMoveAnalysis } from "../historical-entry-context-future-move-analysis";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
import {
  buildHistoricalEntryContextFutureMovePredictivenessAnalysis,
  classifyTargetVsFutureMoveCategory,
  futureMoveReachedAtThreshold,
} from "../historical-entry-context-future-move-predictiveness-analysis";
import { HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION } from "../historical-entry-context-future-move-predictiveness-analysis-types";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
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
  const b14 = buildHistoricalEntryContextFutureMoveAnalysis({
    lifecycleReport,
    candles,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    eligibilityAuditReport,
    entryContextTargetResearchReport: b13,
    displacementEqualityTargetMechanicsAnalysisReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
  });
  return {
    lifecycleReport,
    b14,
    eligibilityAuditReport,
    b12t,
    b12u,
    b13,
    b12w,
    b12x,
  };
}

function buildB15(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalEntryContextFutureMovePredictivenessAnalysis({
    lifecycleReport: pipe.lifecycleReport,
    futureMoveAnalysisReport: pipe.b14,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    historicalEntryContextTargetResearchReport: pipe.b13,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetReport: pipe.b12u,
  });
}

describe("historical-entry-context-future-move-predictiveness-analysis (B-15)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION, "1.0");
  });

  it("B–D. threshold and future window semantics", () => {
    assert.equal(futureMoveReachedAtThreshold(1, 1), true);
    assert.equal(futureMoveReachedAtThreshold(0.999, 1), false);
    assert.equal(futureMoveReachedAtThreshold(null, 1), false);
  });

  it("E. frozen BTC integration", () => {
    const report = buildB15(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.classifiableForFutureMove, 320);
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles),
      FIXTURE_CHECKSUM
    );
    assert.equal(report.thresholds.length, 9);
  });

  it("F–I. displacement headroom RR reward crosses", () => {
    const report = buildB15(frozenStack());
    assert.ok(report.displacementAnalysis.buckets.length > 0);
    assert.equal(report.headroomAnalysis.presence.buckets.length, 2);
    assert.ok(report.prospectiveRrAnalysis.buckets.length >= 3);
    assert.ok(report.canonicalRewardAnalysis.buckets.length > 0);
  });

  it("J–K. direction wave family", () => {
    const report = buildB15(frozenStack());
    assert.ok(report.directionAnalysis.buckets.length > 0);
    assert.ok(report.waveAnalysis.secondaryAssociational);
    assert.ok(report.setupFamilyAnalysis.buckets.length > 0);
  });

  it("L–M. FAILED+FAVORABLE and PASSED+ADVERSE", () => {
    const report = buildB15(frozenStack());
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("N–O. Wilson and sample quality", () => {
    const report = buildB15(frozenStack());
    const slice = report.displacementAnalysis.buckets[0]!.thresholdSlices[0]!;
    assert.equal(slice.wilson95.method, "WILSON_SCORE_INTERVAL");
    assert.ok(slice.sampleSizeQuality.length > 0);
  });

  it("P–Q. conditional reach and multi-threshold profile", () => {
    const report = buildB15(frozenStack());
    assert.ok(report.conditionalHistoricalReach.length > 0);
    assert.ok(report.multiThresholdProfiles.length > 0);
    assert.equal(report.conditionalHistoricalReach[0]!.label, "HISTORICAL_CONDITIONAL_REACH_RATE");
  });

  it("R. target-vs-future classification", () => {
    const pipe = frozenStack();
    const report = buildB15(pipe);
    assert.ok(report.targetVsFutureMove.some((r) => r.category === "FUTURE_REACHED_TARGET"));
    assert.ok(
      report.targetVsFutureMove.some((r) => r.category === "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH")
    );
    const sample = pipe.b14.perTrade.find((p) => p.movementOutcomeClass === "TARGET_REACHED");
    if (sample) {
      assert.equal(classifyTargetVsFutureMoveCategory(sample), "FUTURE_REACHED_TARGET");
    }
  });

  it("S–T. B-14 parity", () => {
    const pipe = frozenStack();
    const report = buildB15(pipe);
    assert.equal(report.parity.b14ThresholdReachCountsMatch, true);
    assert.equal(report.parity.b14PopulationClassifiable, 320);
    const t1 = pipe.b14.thresholdAnalysis.find((x) => x.thresholdPercent === 1)!;
    assert.equal(t1.futureMoveReachedCount, 175);
    const timeRow = report.timeToThresholdAnalysis.find((r) => r.thresholdPercent === 1)!;
    assert.equal(timeRow.medianBarsToReach, t1.medianBarsToReach);
  });

  it("U. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      futureMoveAnalysisReport: pipe.b14,
      displacementEqualityTargetMechanicsReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalEntryContextFutureMovePredictivenessAnalysis(input),
      buildHistoricalEntryContextFutureMovePredictivenessAnalysis(input)
    );
  });

  it("V. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      l: pipe.lifecycleReport,
      b14: pipe.b14,
      t: pipe.b12t,
      u: pipe.b12u,
    });
    buildB15(pipe);
    assert.equal(
      JSON.stringify({
        l: pipe.lifecycleReport,
        b14: pipe.b14,
        t: pipe.b12t,
        u: pipe.b12u,
      }),
      before
    );
  });

  it("W. lookahead attestation", () => {
    const report = buildB15(frozenStack());
    assert.equal(report.lookaheadAttestation.entryContextEnd, "E");
    assert.equal(report.lookaheadAttestation.futureOutcomeStart, "E+1");
  });

  it("X. architecture guard module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-future-move-predictiveness-analysis.ts"),
      "utf8"
    );
    assert.ok(!mod.includes("buildHistoricalEntryContextFutureMoveAnalysis"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
  });

  it("Y. diagnostic summary and examples", () => {
    const report = buildB15(frozenStack());
    assert.equal(report.diagnosticSummary.length, 20);
    assert.ok(report.tradeExamples.length >= 30);
    assert.ok(report.separationAnalysis.length > 0);
  });
});
