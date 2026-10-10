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
import { buildHistoricalEntryContextFutureMovePredictivenessAnalysis } from "../historical-entry-context-future-move-predictiveness-analysis";
import { buildHistoricalEntryContextSignalIndependenceAudit } from "../historical-entry-context-signal-independence-audit";
import { buildHistoricalEntryContextTargetResearch } from "../historical-entry-context-target-research";
import { buildHistoricalEntryPriceMoveQualityAnalysis } from "../historical-entry-price-move-quality-analysis";
import { buildHistoricalDelayedEntryResearch } from "../historical-delayed-entry-research";
import { buildHistoricalDelayedEntryDecisionAudit } from "../historical-delayed-entry-decision-audit";
import {
  buildHistoricalPhaseBIntegratedEvidenceAudit,
} from "../historical-phase-b-integrated-evidence-audit";
import { HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION } from "../historical-phase-b-integrated-evidence-audit-types";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import { buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis } from "../historical-target-distance-reachability-cost-balance-analysis";
import { buildHistoricalTargetDistanceStructuralContextAnalysis } from "../historical-target-distance-structural-context-analysis";
import { buildHistoricalTargetProvenanceStructuralDistanceAnalysis } from "../historical-target-provenance-structural-distance-analysis";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj as object)) {
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

function frozenFullStack() {
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
  const b12s = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
    lifecycleReport,
    eligibilityAuditReport,
    artifactMeasurements: result.report.artifact.measurements,
  });
  const b12p = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
    lifecycleReport,
    eligibilityAuditReport,
  });
  const b12r = buildHistoricalEntryPriceMoveQualityAnalysis({
    lifecycleReport,
    eligibilityAuditReport,
    rrThresholdTheoreticalRAnalysisReport: b12p,
  });
  const b12y = buildHistoricalTargetDistanceStructuralContextAnalysis({
    lifecycleReport,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    displacementEqualityTargetMechanicsAnalysisReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
    alternativeTargetModelAnalysisReport: b12v,
  });
  const b12z = buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis({
    lifecycleReport,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    historicalEntryPriceMoveQualityAnalysisReport: b12r,
    historicalTargetDistanceStructuralContextAnalysisReport: b12y,
    displacementEqualityTargetMechanicsAnalysisReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
    eligibilityAuditReport,
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
  const b15 = buildHistoricalEntryContextFutureMovePredictivenessAnalysis({
    lifecycleReport,
    futureMoveAnalysisReport: b14,
    eligibilityAuditReport,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetReport: b12u,
    costAwareCounterfactualAnalysisReport: b12x,
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
  const b19 = buildHistoricalDelayedEntryDecisionAudit({
    lifecycleReport,
    delayedEntryResearchReport: b18,
    reachabilityReplayReport: b12w,
    candles,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: b12u,
    costAwareCounterfactualAnalysisReport: b12x,
    historicalEntryContextTargetResearchReport: b13,
    entryContextCombinationFutureMoveAnalysisReport: b16,
    signalIndependenceAuditReport: b17,
    eligibilityAuditReport,
  });
  return {
    lifecycleReport,
    candles,
    eligibilityAuditReport,
    b12r,
    b12s,
    b12t,
    b12u,
    b12v,
    b12w,
    b12x,
    b12y,
    b12z,
    b13,
    b14,
    b15,
    b16,
    b17,
    b18,
    b19,
  };
}

let cachedPipe: ReturnType<typeof frozenFullStack> | undefined;

function stack() {
  if (!cachedPipe) cachedPipe = frozenFullStack();
  return cachedPipe;
}

function buildB20(pipe: ReturnType<typeof frozenFullStack>) {
  return buildHistoricalPhaseBIntegratedEvidenceAudit({
    lifecycleReport: pipe.lifecycleReport,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    historicalEntryPriceMoveQualityAnalysisReport: pipe.b12r,
    historicalTargetProvenanceStructuralDistanceAnalysisReport: pipe.b12s,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetReport: pipe.b12u,
    alternativeTargetModelAnalysisReport: pipe.b12v,
    reachabilityReplayReport: pipe.b12w,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
    historicalTargetDistanceStructuralContextAnalysisReport: pipe.b12y,
    historicalTargetDistanceReachabilityCostBalanceAnalysisReport: pipe.b12z,
    historicalEntryContextTargetResearchReport: pipe.b13,
    futureMoveAnalysisReport: pipe.b14,
    futureMovePredictivenessAnalysisReport: pipe.b15,
    entryContextCombinationFutureMoveAnalysisReport: pipe.b16,
    signalIndependenceAuditReport: pipe.b17,
    delayedEntryResearchReport: pipe.b18,
    delayedEntryDecisionAuditReport: pipe.b19,
    candles: pipe.candles,
  });
}

describe("historical-phase-b-integrated-evidence-audit (B-20)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION, "1.0");
  });

  it("B. population", () => {
    const report = buildB20(stack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.replayClassifiable, 320);
    assert.equal(report.population.notReplayable, 16);
    assert.equal(report.population.horizonBars, 24);
  });

  it("C. frozen checksum", () => {
    const candles = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(candles), FIXTURE_CHECKSUM);
    const report = buildB20(stack());
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
  });

  it("D–S. phase source matrix consumed", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    const consumed = report.phaseSourceMatrix.filter((r) => r.consumed).map((r) => r.phaseId);
    for (const id of [
      "B-12h",
      "B-12p",
      "B-12r",
      "B-12s",
      "B-12t",
      "B-12u",
      "B-12v",
      "B-12w",
      "B-12x",
      "B-12y",
      "B-12z",
      "B-13",
      "B-14",
      "B-15",
      "B-16",
      "B-17",
      "B-18",
      "B-19",
      "B-12q",
    ]) {
      assert.ok(consumed.includes(id), id);
    }
    assert.equal(report.missingSections.length, 0);
  });

  it("D. B-12r parity (reward bucket population)", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    const row = report.targetMagnitudeEvidence.find((r) => r.rewardBucketLabel === "REWARD_0_50_TO_1_00");
    const b12r = pipe.b12r.rewardBuckets.byBucket.REWARD_0_50_TO_1_00;
    assert.equal(row?.population, b12r.trades);
  });

  it("I. B-12w parity (canonical reach)", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    const cross = pipe.b12w.rewardCross.find(
      (c) => c.rewardBucket === "REWARD_0_50_TO_1_00" && c.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    const row = report.targetMagnitudeEvidence.find((r) => r.rewardBucketLabel === "REWARD_0_50_TO_1_00");
    assert.equal(row?.targetReachRate, cross.targetReached / cross.trades);
  });

  it("N. B-14 parity (future move thresholds)", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    const b14t = pipe.b14.thresholdAnalysis.find((t) => t.thresholdPercent === 1)!;
    const row = report.futureMoveEvidence.find((r) => r.thresholdPercent === 1)!;
    assert.equal(row.futureMoveReachRate, b14t.futureMoveReachRate);
    assert.equal(row.medianBarsToReach, b14t.medianBarsToReach);
  });

  it("Q. B-17 parity (signal independence)", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    const disp = report.signalIndependenceSummary.find((s) => s.signal === "displacement");
    const b17disp = pipe.b17.featureIndependenceSummary.find((s) => s.context === "displacement");
    assert.equal(disp?.validityClass, b17disp?.independentInformationStatus);
    assert.equal(pipe.b17.geometricRedundancyAnalysis.validityClass, "POSSIBLY_REDUNDANT_GEOMETRY");
  });

  it("R–S. B-18/B-19 delayed entry surfaces", () => {
    const pipe = stack();
    const report = buildB20(pipe);
    assert.ok(report.delayedEntryEvidenceSummary.length > 0);
    assert.ok(report.entryDecisionSurface.length > 0);
    assert.ok(report.entryDecisionSurface.every((c) => c.tag === "DESCRIPTIVE_DECISION_SURFACE"));
    const modelA = report.entryDecisionSurface.find(
      (c) => c.entryModel === "MODEL_A_FIXED_RETRACEMENT" && c.retracementLevel === "0.25%"
    );
    assert.ok(modelA);
  });

  it("T–W. target/cost/risk surfaces", () => {
    const report = buildB20(stack());
    assert.ok(report.targetDecisionSurface.length >= 10);
    assert.ok(report.costSurface.length > 0);
    assert.ok(report.riskRrSurface.length > 0);
    assert.ok(report.canonicalVsDelayedDeltas.length > 0);
  });

  it("Y. context evidence", () => {
    const report = buildB20(stack());
    assert.ok(report.contextConditionalEvidence.some((c) => c.dimension === "headroom"));
  });

  it("Z–AA. failed favorable / passed adverse cohorts", () => {
    const report = buildB20(stack());
    assert.equal(report.failedFavorableEvidence.cohortSize, 97);
    assert.equal(report.passedAdverseEvidence.cohortSize, 88);
  });

  it("AB. temporal descriptive split labels", () => {
    const report = buildB20(stack());
    assert.ok(
      report.temporalStabilitySummary.every((t) => t.label === "TEMPORAL_DESCRIPTIVE_SPLIT")
    );
  });

  it("AC. statistical quality attestation", () => {
    const report = buildB20(stack());
    assert.equal(report.statisticalQualityAttestation.interpretWithCautionWhenNBelow10, true);
    assert.ok(report.statisticalQualityAttestation.sampleSizeLabels.includes("INSUFFICIENT_SAMPLE"));
  });

  it("AD. multiple comparison warning", () => {
    const report = buildB20(stack());
    assert.ok(report.multipleComparisonWarning.statement.includes("multiple"));
    assert.ok(report.warnings.includes("multiple_comparison_not_adjusted"));
  });

  it("AE–AF. evidence list tagging", () => {
    const report = buildB20(stack());
    assert.ok(report.directObservations.includes("replay_reach"));
    assert.ok(report.associationalFindings.includes("context_slices"));
    assert.ok(report.counterfactualEvidence.includes("delayed_entry_models"));
    assert.ok(report.notEstablished.includes("production_strategy"));
  });

  it("AG. lookahead attestation", () => {
    const report = buildB20(stack());
    assert.equal(report.lookaheadAttestation.entryContextEnd, "E");
    assert.equal(report.lookaheadAttestation.outcomeFrom, "E+1");
  });

  it("AH. missing report sections", () => {
    const pipe = stack();
    const report = buildHistoricalPhaseBIntegratedEvidenceAudit({
      lifecycleReport: pipe.lifecycleReport,
    });
    assert.ok(report.missingSections.length > 5);
    assert.equal(report.targetMagnitudeEvidence.length, 7);
  });

  it("AI. determinism", () => {
    const pipe = stack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      delayedEntryResearchReport: pipe.b18,
      reachabilityReplayReport: pipe.b12w,
      futureMoveAnalysisReport: pipe.b14,
    };
    assert.deepEqual(
      buildHistoricalPhaseBIntegratedEvidenceAudit(input),
      buildHistoricalPhaseBIntegratedEvidenceAudit(input)
    );
  });

  it("AJ. immutability", () => {
    const pipe = stack();
    const input = deepFreeze({
      lifecycleReport: pipe.lifecycleReport,
      delayedEntryDecisionAuditReport: pipe.b19,
      reachabilityReplayReport: pipe.b12w,
    });
    buildHistoricalPhaseBIntegratedEvidenceAudit(input);
    assert.ok(Object.isFrozen(input.lifecycleReport));
  });

  it("AL. frozen integration full stack", () => {
    const report = buildB20(stack());
    assert.equal(report.schemaVersion, "1.0");
    assert.ok(report.researchCandidates.length >= 5);
  });

  it("AM–AN. research candidates and next experiments", () => {
    const report = buildB20(stack());
    for (const c of report.researchCandidates) {
      assert.equal(c.status, "RESEARCH_CANDIDATE");
      assert.ok(c.nextExperiment.length > 0);
      assert.ok(["HIGH", "MEDIUM", "LOW"].includes(c.evidenceCoverage));
    }
  });

  it("AO. production decision NOT_ESTABLISHED", () => {
    const report = buildB20(stack());
    assert.equal(report.productionDecision.productionRuleStatus, "NOT_ESTABLISHED");
    assert.equal(report.productionDecision.entryRuleStatus, "NOT_ESTABLISHED");
    assert.equal(report.productionDecision.targetRuleStatus, "NOT_ESTABLISHED");
    assert.equal(report.productionDecision.delayedEntryRuleStatus, "NOT_ESTABLISHED");
    assert.equal(report.productionDecision.generalMarketRule, "NOT_ESTABLISHED");
  });

  it("AP. no optimizer language", () => {
    const report = buildB20(stack());
    const json = JSON.stringify(report);
    assert.ok(!/\bBEST\b/.test(json));
    assert.ok(!/\bOPTIMAL\b/.test(json));
    assert.ok(!/\bRECOMMENDED\b/.test(json));
    assert.ok(report.warnings.includes("no_optimizer"));
  });

  it("AQ. no production mutation (module guard)", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-phase-b-integrated-evidence-audit.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalPhaseBIntegratedEvidenceAudit"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("from \"./setup/trade-evaluation\""));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("fetch("));
  });
});
