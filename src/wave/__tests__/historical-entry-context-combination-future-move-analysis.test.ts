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
import {
  buildCombinationBucketLabel,
  buildHistoricalEntryContextCombinationFutureMoveAnalysis,
} from "../historical-entry-context-combination-future-move-analysis";
import { HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION } from "../historical-entry-context-combination-future-move-analysis-types";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
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
  const eligibilityAuditReport = auditIndependentTradeTheoreticalREligibility({ lifecycleReport });
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
  return { lifecycleReport, b14, eligibilityAuditReport, b12t, b12u, b13, b12w, b12x };
}

function buildB16(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalEntryContextCombinationFutureMoveAnalysis({
    lifecycleReport: pipe.lifecycleReport,
    futureMoveAnalysisReport: pipe.b14,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    historicalEntryContextTargetResearchReport: pipe.b13,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
  });
}

describe("historical-entry-context-combination-future-move-analysis (B-16)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION, "1.0");
  });

  it("B–D. pair and triple generation", () => {
    const report = buildB16(frozenStack());
    assert.equal(report.pairCombinations.length, 12);
    assert.equal(report.tripleCombinations.length, 7);
    assert.ok(report.pairCombinations[0]!.buckets.length > 0);
  });

  it("E–F. threshold and conditional reach", () => {
    const report = buildB16(frozenStack());
    const cell = report.pairCombinations[0]!.buckets[0]!.thresholdCells[0]!;
    assert.equal(cell.label, "HISTORICAL_CONDITIONAL_REACH_RATE");
    assert.ok(report.conditionalHistoricalReach.length > 0);
  });

  it("G–H. Wilson and sample quality", () => {
    const report = buildB16(frozenStack());
    const cell = report.pairCombinations[0]!.buckets[0]!.thresholdCells[1]!;
    assert.equal(cell.wilson95.method, "WILSON_SCORE_INTERVAL");
    assert.ok(cell.sampleSizeQuality.length > 0);
  });

  it("I–J. separation and stability", () => {
    const report = buildB16(frozenStack());
    assert.ok(report.separationAnalysis.length > 0);
    assert.ok(report.crossThresholdStability.length > 0);
  });

  it("K–N. displacement headroom RR reward", () => {
    const report = buildB16(frozenStack());
    assert.equal(report.headroomAnalysis.combinationSpecId, "PAIR_DISPLACEMENT_HEADROOM");
    assert.equal(report.displacementAnalysis.combinationSpecId, "PAIR_DISPLACEMENT_REWARD");
    assert.equal(report.rrAnalysis.combinationSpecId, "PAIR_DISPLACEMENT_RR");
  });

  it("O–P. structural and target distance", () => {
    const report = buildB16(frozenStack());
    assert.ok(
      report.pairCombinations.some((p) => p.combinationSpecId === "PAIR_STRUCTURAL_DISPLACEMENT")
    );
    assert.ok(report.targetDistanceAnalysis.length >= 2);
  });

  it("Q–R. cohorts", () => {
    const report = buildB16(frozenStack());
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("S–T. MFE and target touch distinction", () => {
    const report = buildB16(frozenStack());
    assert.ok(report.mfeMaeAnalysis.length > 0);
    assert.ok(report.targetDistanceAnalysis[1]!.scenarioLabel.includes("without_touch"));
  });

  it("U. B-14 parity", () => {
    const pipe = frozenStack();
    const report = buildB16(pipe);
    assert.equal(report.parity.b14ThresholdReachCountsMatch, true);
    const t1 = pipe.b14.thresholdAnalysis.find((x) => x.thresholdPercent === 1)!;
    assert.equal(t1.futureMoveReachedCount, 175);
  });

  it("V–X. B-12w B-12h B-12x reference immutability", () => {
    const pipe = frozenStack();
    const sumBefore = pipe.eligibilityAuditReport.decisiveRows.reduce(
      (s, r) => s + (r.theoreticalR ?? 0),
      0
    );
    const costBefore = JSON.stringify(pipe.b12x.failedFavorableAnalysis.trades);
    const reachBefore = pipe.b12w.modelResults[0]!.targetReached;
    buildB16(pipe);
    const sumAfter = pipe.eligibilityAuditReport.decisiveRows.reduce(
      (s, r) => s + (r.theoreticalR ?? 0),
      0
    );
    assert.equal(sumAfter, sumBefore);
    assert.equal(JSON.stringify(pipe.b12x.failedFavorableAnalysis.trades), costBefore);
    assert.equal(pipe.b12w.modelResults[0]!.targetReached, reachBefore);
    assert.equal(buildB16(pipe).theoreticalRReference.consumed, true);
  });

  it("Y–Z. determinism and immutability", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      futureMoveAnalysisReport: pipe.b14,
      displacementEqualityTargetMechanicsReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalEntryContextCombinationFutureMoveAnalysis(input),
      buildHistoricalEntryContextCombinationFutureMoveAnalysis(input)
    );
    const before = JSON.stringify(pipe.b14);
    buildHistoricalEntryContextCombinationFutureMoveAnalysis(input);
    assert.equal(JSON.stringify(pipe.b14), before);
  });

  it("AA. lookahead", () => {
    const report = buildB16(frozenStack());
    assert.equal(report.lookaheadAttestation.entryContextEnd, "E");
    assert.equal(report.lookaheadAttestation.futureOutcomeStart, "E+1");
  });

  it("AB. multiple-comparison warning", () => {
    const report = buildB16(frozenStack());
    assert.ok(report.multipleComparisonWarning.combinationCellsTested > 0);
    assert.ok(report.warnings.some((w) => w.includes("multiple_comparisons")));
  });

  it("AC. architecture guard module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-combination-future-move-analysis.ts"),
      "utf8"
    );
    assert.ok(!mod.includes("buildHistoricalEntryContextFutureMoveAnalysis"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("AD. frozen BTC integration", () => {
    const report = buildB16(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.classifiableForFutureMove, 320);
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(report.diagnosticSummary.length, 20);
    assert.ok(report.tradeExamples.length > 0);
  });

  it("buildCombinationBucketLabel", () => {
    const report = buildB16(frozenStack());
    const row = report.tradeExamples[0]!;
    assert.ok(row.bucketLabels[0]!.includes("displacement="));
  });
});
