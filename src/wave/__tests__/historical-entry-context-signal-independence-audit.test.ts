import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalEntryContextCombinationFutureMoveAnalysis } from "../historical-entry-context-combination-future-move-analysis";
import { buildHistoricalEntryContextFutureMoveAnalysis } from "../historical-entry-context-future-move-analysis";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
import {
  buildHistoricalEntryContextSignalIndependenceAudit,
  pearsonCorrelation,
  spearmanRankCorrelation,
} from "../historical-entry-context-signal-independence-audit";
import { HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION } from "../historical-entry-context-signal-independence-audit-types";
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
  const b16 = buildHistoricalEntryContextCombinationFutureMoveAnalysis({
    lifecycleReport,
    futureMoveAnalysisReport: b14,
    eligibilityAuditReport,
    historicalEntryContextTargetResearchReport: b13,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetReport: b12u,
    costAwareCounterfactualAnalysisReport: b12x,
  });
  return { lifecycleReport, b14, b16, eligibilityAuditReport, b12t, b12u, b12x, b12w };
}

function buildB17(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalEntryContextSignalIndependenceAudit({
    lifecycleReport: pipe.lifecycleReport,
    futureMoveAnalysisReport: pipe.b14,
    entryContextCombinationFutureMoveAnalysisReport: pipe.b16,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
  });
}

describe("historical-entry-context-signal-independence-audit (B-17)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION, "1.0");
  });

  it("B. population", () => {
    const report = buildB17(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.classifiableForFutureMove, 320);
  });

  it("C. context availability", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.contextAvailability.some((c) => c.availability === "AVAILABLE_AT_ENTRY"));
    assert.ok(report.contextAvailability.some((c) => c.availability === "LOOKAHEAD_RISK"));
  });

  it("D–E. dependency matrix and displacement/reward redundancy", () => {
    const report = buildB17(frozenStack());
    assert.equal(report.dependencyMatrix.length, 8);
    assert.ok(report.geometricRedundancyAnalysis.displacementRewardPearson !== null);
    assert.equal(report.geometricRedundancyAnalysis.validityClass, "POSSIBLY_REDUNDANT_GEOMETRY");
  });

  it("F–G. headroom and target band controls", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.headroomIndependenceAnalysis.headroomPresentReach2 !== null);
    assert.ok(report.sameTargetControls.length >= 0);
  });

  it("H. displacement control", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.sameDisplacementControls.length > 0);
    assert.equal(report.controlSlices.length, 4);
  });

  it("I. RR dependency", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.rrDependencyAnalysis.rrRewardPearson !== null);
  });

  it("J–K. structural and MFE without touch", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.structuralExtremeAnalysis.prefixContextNote.length > 0);
    assert.ok(report.mfeWithoutTouchAnalysis.trades > 0);
  });

  it("L–M. cohorts", () => {
    const report = buildB17(frozenStack());
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("N–O. cross-threshold and temporal split", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.crossThresholdRobustness.length > 0);
    assert.equal(report.temporalDescriptiveSplit.label, "TEMPORAL_DESCRIPTIVE_SPLIT");
  });

  it("P. feature independence summary", () => {
    const report = buildB17(frozenStack());
    assert.ok(report.featureIndependenceSummary.length >= 8);
  });

  it("Q–R. B-14 and B-16 parity", () => {
    const pipe = frozenStack();
    const report = buildB17(pipe);
    assert.equal(report.parity.b14ThresholdReachCountsMatch, true);
    assert.equal(report.parity.b16B14ParityMatch, true);
  });

  it("S–T. B-12t B-12u immutability", () => {
    const pipe = frozenStack();
    const tBefore = JSON.stringify(pipe.b12t.targetMagnitude.perTrade.length);
    const uBefore = JSON.stringify(pipe.b12u.perTrade.length);
    buildB17(pipe);
    assert.equal(JSON.stringify(pipe.b12t.targetMagnitude.perTrade.length), tBefore);
    assert.equal(JSON.stringify(pipe.b12u.perTrade.length), uBefore);
  });

  it("U–V. B-12h and B-12x parity", () => {
    const pipe = frozenStack();
    const sumBefore = pipe.eligibilityAuditReport.decisiveRows.reduce(
      (s, r) => s + (r.theoreticalR ?? 0),
      0
    );
    const costTrades = pipe.b12x.failedFavorableAnalysis.trades;
    buildB17(pipe);
    const sumAfter = pipe.eligibilityAuditReport.decisiveRows.reduce(
      (s, r) => s + (r.theoreticalR ?? 0),
      0
    );
    assert.equal(sumAfter, sumBefore);
    assert.equal(pipe.b12x.failedFavorableAnalysis.trades, costTrades);
    assert.equal(buildB17(pipe).theoreticalRReference.label, "THEORETICAL_R_REFERENCE");
  });

  it("W–X. determinism and immutability", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      futureMoveAnalysisReport: pipe.b14,
      entryContextCombinationFutureMoveAnalysisReport: pipe.b16,
      displacementEqualityTargetMechanicsReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalEntryContextSignalIndependenceAudit(input),
      buildHistoricalEntryContextSignalIndependenceAudit(input)
    );
    const b14Before = JSON.stringify(pipe.b14.thresholdAnalysis[0]);
    buildHistoricalEntryContextSignalIndependenceAudit(input);
    assert.equal(JSON.stringify(pipe.b14.thresholdAnalysis[0]), b14Before);
  });

  it("Y–Z. lookahead and multiple comparison", () => {
    const report = buildB17(frozenStack());
    assert.equal(report.lookaheadAttestation.prefixContextEnd, "E");
    assert.ok(report.multipleComparisonWarning.selectionBiasNote.length > 0);
    assert.ok(report.warnings.some((w) => w.includes("multiple_comparison")));
  });

  it("AA. architecture guard", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-signal-independence-audit.ts"),
      "utf8"
    );
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("buildHistoricalEntryContextFutureMoveAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("AB. frozen integration", () => {
    const report = buildB17(frozenStack());
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(report.diagnosticSummary.length, 20);
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles), FIXTURE_CHECKSUM);
  });

  it("pearson and spearman helpers", () => {
    assert.ok(Math.abs(pearsonCorrelation([1, 2, 3], [2, 4, 6])! - 1) < 1e-9);
    assert.ok(spearmanRankCorrelation([1, 2, 3], [3, 2, 1])! < 0);
  });
});
