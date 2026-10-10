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
import { buildHistoricalEntryContextSignalIndependenceAudit } from "../historical-entry-context-signal-independence-audit";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
import { buildHistoricalDelayedEntryResearch } from "../historical-delayed-entry-research";
import { buildHistoricalDelayedEntryDecisionAudit } from "../historical-delayed-entry-decision-audit";
import { HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION } from "../historical-delayed-entry-decision-audit-types";
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
  const b17 = buildHistoricalEntryContextSignalIndependenceAudit({
    lifecycleReport,
    futureMoveAnalysisReport: b14,
    entryContextCombinationFutureMoveAnalysisReport: b16,
    eligibilityAuditReport,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetReport: b12u,
    costAwareCounterfactualAnalysisReport: b12x,
  });
  const b18 = buildHistoricalDelayedEntryResearch({
    lifecycleReport,
    candles,
    reachabilityReplayReport: b12w,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
    costAwareCounterfactualAnalysisReport: b12x,
    historicalEntryContextTargetResearchReport: b13,
    entryContextCombinationFutureMoveAnalysisReport: b16,
    signalIndependenceAuditReport: b17,
    eligibilityAuditReport,
  });
  return { lifecycleReport, candles, b12w, b12t, b12u, b12x, b13, b16, b17, b18, eligibilityAuditReport };
}

function buildB19(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalDelayedEntryDecisionAudit({
    lifecycleReport: pipe.lifecycleReport,
    delayedEntryResearchReport: pipe.b18,
    reachabilityReplayReport: pipe.b12w,
    candles: pipe.candles,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
    historicalEntryContextTargetResearchReport: pipe.b13,
    entryContextCombinationFutureMoveAnalysisReport: pipe.b16,
    signalIndependenceAuditReport: pipe.b17,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
  });
}

describe("historical-delayed-entry-decision-audit (B-19)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION, "1.0");
  });

  it("B. population", () => {
    const report = buildB19(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.replayClassifiable, 320);
  });

  it("C–G. B-18 parity", () => {
    const report = buildB19(frozenStack());
    assert.equal(report.b18Parity.allMatch, true);
    assert.equal(report.auditBlocked, false);
    assert.equal(report.b18Parity.mismatchCount, 0);
  });

  it("H–I. I1 and I2 invalidation separation", () => {
    const report = buildB19(frozenStack());
    const i1 = report.invalidationComparison.rows.filter((r) => r.invalidationModel === "I1_FROZEN_INVALIDATION");
    const i2 = report.invalidationComparison.rows.filter((r) => r.invalidationModel === "I2_RELATIVE_RISK_REFERENCE");
    assert.ok(i1.length > 0);
    assert.ok(i2.length > 0);
    assert.ok(report.invalidationComparison.i2Note.includes("not production"));
  });

  it("J–K. T1 and T2 target separation", () => {
    const report = buildB19(frozenStack());
    assert.ok(report.targetModelSeparation.t1ReachSummary.length > 0);
    assert.ok(report.targetModelSeparation.t2Note.includes("not production"));
  });

  it("L. full cost matrix", () => {
    const report = buildB19(frozenStack());
    assert.ok(report.fullCostMatrix.some((c) => c.roundTripCostPercent === 0.2));
    assert.ok(report.fullCostMatrix.length > 50);
  });

  it("M–N. missed entry and canonical reference", () => {
    const report = buildB19(frozenStack());
    const row = report.missedEntryDetail.find((r) => r.model === "MODEL_A_FIXED_RETRACEMENT" && r.levelLabel === "1.00%");
    assert.ok(row);
    assert.ok(row!.counterfactualReferenceNote.includes("COUNTERFACTUAL_REFERENCE"));
  });

  it("O–Q. improvement and decision table", () => {
    const report = buildB19(frozenStack());
    assert.equal(report.decisionComparisonTable.length, report.improvementDistribution.length);
    assert.ok(report.decisionComparisonTable.some((r) => r.model === "MODEL_D_NO_DELAY_BASELINE"));
  });

  it("R–T. reach, time-to-fill, MFE/MAE", () => {
    const report = buildB19(frozenStack());
    assert.ok(report.targetReachDetail.length > 0);
    assert.ok(report.timeToFillSummary.length > 0);
    assert.ok(report.mfeMaeSummary[0]!.outcomeWindowNote.includes("ENTRY_FILL_BAR+1"));
  });

  it("U–X. buckets and cohorts", () => {
    const report = buildB19(frozenStack());
    assert.ok(report.targetRewardBucketAudit.length > 0);
    assert.equal(report.failedFavorableAudit.length, 11);
    assert.ok(report.failedFavorableAudit.length > 0);
    assert.ok(report.passedAdverseAudit.length > 0);
  });

  it("Y–AA. temporal, Wilson, sample quality", () => {
    const report = buildB19(frozenStack());
    assert.equal(report.temporalDescriptiveSplit.label, "TEMPORAL_DESCRIPTIVE_SPLIT");
    assert.ok(report.decisionComparisonTable[0]!.fillRateWilson95.lower <= 1);
  });

  it("AB–AE. direct/associational, lookahead, determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      delayedEntryResearchReport: pipe.b18,
      reachabilityReplayReport: pipe.b12w,
      candles: pipe.candles,
      displacementEqualityTargetMechanicsReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
    };
    assert.deepEqual(buildHistoricalDelayedEntryDecisionAudit(input), buildHistoricalDelayedEntryDecisionAudit(input));
    const report = buildB19(pipe);
    assert.equal(report.lookaheadAttestation.entryLevelComputedAt, "E");
    assert.equal(report.productionDecisionAudit.conclusion, "NOT_ESTABLISHED");
  });

  it("AF–AM. architecture and frozen integration", () => {
    const report = buildB19(frozenStack());
    assert.equal(report.diagnosticSummary.length, 20);
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles), FIXTURE_CHECKSUM);
    const mod = readFileSync(join(process.cwd(), "src/wave/historical-delayed-entry-decision-audit.ts"), "utf8");
    assert.ok(!mod.includes("buildHistoricalDelayedEntryResearch"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });
});
