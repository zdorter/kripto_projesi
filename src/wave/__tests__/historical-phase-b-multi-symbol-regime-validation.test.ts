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
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import { buildHistoricalDelayedEntryResearch } from "../historical-delayed-entry-research";
import { buildHistoricalDelayedEntryDecisionAudit } from "../historical-delayed-entry-decision-audit";
import { buildHistoricalPhaseBIntegratedEvidenceAudit } from "../historical-phase-b-integrated-evidence-audit";
import {
  buildHistoricalPhaseBMultiSymbolRegimeValidation,
  phaseBResearchScopeKey,
} from "../historical-phase-b-multi-symbol-regime-validation";
import {
  HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION,
  PHASE_B_RESEARCH_PRIMARY_TIMEFRAME,
  PHASE_B_RESEARCH_TARGET_SYMBOLS,
} from "../historical-phase-b-multi-symbol-regime-validation-types";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import { buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis } from "../historical-target-distance-reachability-cost-balance-analysis";
import { buildHistoricalTargetDistanceStructuralContextAnalysis } from "../historical-target-distance-structural-context-analysis";
import { buildHistoricalTargetProvenanceStructuralDistanceAnalysis } from "../historical-target-provenance-structural-distance-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH } from "../historical-frozen-ohlcv-dataset-types";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const BTC_SCOPE = phaseBResearchScopeKey("BTCUSDT", "1H");

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj as object)) {
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

let cached: ReturnType<typeof buildFrozenBtcStack> | undefined;

function buildFrozenBtcStack() {
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  const candles = loaded.candles;
  const meta = loaded.document.metadata;
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
  const b20 = buildHistoricalPhaseBIntegratedEvidenceAudit({
    lifecycleReport,
    eligibilityAuditReport,
    historicalEntryPriceMoveQualityAnalysisReport: b12r,
    historicalTargetProvenanceStructuralDistanceAnalysisReport: b12s,
    displacementEqualityTargetMechanicsReport: b12t,
    structuralExtremeVsDisplacementTargetReport: b12u,
    alternativeTargetModelAnalysisReport: b12v,
    reachabilityReplayReport: b12w,
    costAwareCounterfactualAnalysisReport: b12x,
    historicalTargetDistanceStructuralContextAnalysisReport: b12y,
    historicalTargetDistanceReachabilityCostBalanceAnalysisReport: b12z,
    historicalEntryContextTargetResearchReport: b13,
    futureMoveAnalysisReport: b14,
    futureMovePredictivenessAnalysisReport: b15,
    entryContextCombinationFutureMoveAnalysisReport: b16,
    signalIndependenceAuditReport: b17,
    delayedEntryResearchReport: b18,
    delayedEntryDecisionAuditReport: b19,
    candles,
  });
  const dataset = {
    symbol: "BTCUSDT",
    timeframe: "1H",
    fixturePath: BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
    datasetChecksum: meta.datasetChecksum,
    candleCount: meta.candleCount,
    firstTimestamp: meta.firstTimestamp,
    lastTimestamp: meta.lastTimestamp,
    status: "AVAILABLE" as const,
    candles,
  };
  return {
    dataset,
    lifecycleReport,
    b12w,
    b14,
    b15,
    b17,
    b19,
    b20,
    b12r,
    b12s,
    b12t,
    b12u,
    b12v,
    b12x,
    b12y,
    b12z,
    b13,
    b16,
    b18,
    eligibilityAuditReport,
  };
}

function stack() {
  if (!cached) cached = buildFrozenBtcStack();
  return cached;
}

function buildB21(pipe: ReturnType<typeof buildFrozenBtcStack>) {
  const scope = BTC_SCOPE;
  return buildHistoricalPhaseBMultiSymbolRegimeValidation({
    datasets: [pipe.dataset],
    lifecycleReports: { [scope]: pipe.lifecycleReport },
    eligibilityAuditReports: { [scope]: pipe.eligibilityAuditReport },
    historicalEntryPriceMoveQualityAnalysisReports: { [scope]: pipe.b12r },
    historicalTargetProvenanceStructuralDistanceAnalysisReports: { [scope]: pipe.b12s },
    displacementEqualityTargetMechanicsReports: { [scope]: pipe.b12t },
    structuralExtremeVsDisplacementTargetReports: { [scope]: pipe.b12u },
    alternativeTargetModelAnalysisReports: { [scope]: pipe.b12v },
    reachabilityReplayReports: { [scope]: pipe.b12w },
    costAwareCounterfactualAnalysisReports: { [scope]: pipe.b12x },
    historicalTargetDistanceStructuralContextAnalysisReports: { [scope]: pipe.b12y },
    historicalTargetDistanceReachabilityCostBalanceAnalysisReports: { [scope]: pipe.b12z },
    historicalEntryContextTargetResearchReports: { [scope]: pipe.b13 },
    futureMoveAnalysisReports: { [scope]: pipe.b14 },
    futureMovePredictivenessAnalysisReports: { [scope]: pipe.b15 },
    entryContextCombinationFutureMoveAnalysisReports: { [scope]: pipe.b16 },
    signalIndependenceAuditReports: { [scope]: pipe.b17 },
    delayedEntryResearchReports: { [scope]: pipe.b18 },
    delayedEntryDecisionAuditReports: { [scope]: pipe.b19 },
    integratedEvidenceAudits: { [scope]: pipe.b20 },
  });
}

describe("historical-phase-b-multi-symbol-regime-validation (B-21)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION, "1.0");
  });

  it("B–C. dataset metadata and checksum", () => {
    const pipe = stack();
    assert.equal(pipe.dataset.datasetChecksum, FIXTURE_CHECKSUM);
    const report = buildB21(pipe);
    const btcRow = report.datasetMatrix.find((d) => d.symbol === "BTCUSDT")!;
    assert.equal(btcRow.status, "AVAILABLE");
    assert.equal(btcRow.datasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles),
      FIXTURE_CHECKSUM
    );
  });

  it("D. population", () => {
    const report = buildB21(stack());
    const pop = report.populationMatrix.find((p) => p.scopeKey === BTC_SCOPE)!;
    assert.equal(pop.independentTrades, 336);
    assert.equal(pop.replayClassifiable, 320);
  });

  it("E. BTC parity (1% future move)", () => {
    const pipe = stack();
    const report = buildB21(pipe);
    const b14 = pipe.b14.thresholdAnalysis.find((t) => t.thresholdPercent === 1)!;
    const row = report.futureMoveGeneralization.find(
      (r) => r.scopeKey === BTC_SCOPE && r.thresholdPercent === 1
    )!;
    assert.equal(row.futureMoveReachRate, b14.futureMoveReachRate);
  });

  it("F. multi-symbol matrix (missing symbols)", () => {
    const report = buildB21(stack());
    assert.equal(report.crossSymbolScopeCount, 1);
    const eth = report.datasetMatrix.find((d) => d.symbol === "ETHUSDT")!;
    assert.equal(eth.status, "DATASET_NOT_AVAILABLE");
    assert.equal(eth.nextDatasetRequired, true);
    assert.ok(report.nextDatasetsRequired.length >= 5);
    for (const sym of PHASE_B_RESEARCH_TARGET_SYMBOLS) {
      assert.ok(report.datasetMatrix.some((d) => d.symbol === sym));
    }
  });

  it("G. regime matrix", () => {
    const report = buildB21(stack());
    assert.ok(report.symbolRegimeMatrix.some((c) => c.regime === "BULLISH"));
    assert.ok(report.symbolRegimeMatrix.some((c) => c.regime === "BEARISH"));
  });

  it("H–N. generalization sections populated", () => {
    const report = buildB21(stack());
    assert.ok(report.targetMagnitudeGeneralization.length > 0);
    assert.ok(report.futureMoveGeneralization.length >= 9);
    assert.ok(report.headroomGeneralization.length > 0);
    assert.ok(report.displacementGeneralization.length > 0);
    assert.ok(report.delayedEntryGeneralization.length > 0);
    assert.ok(report.targetModelGeneralization.length > 0);
    assert.ok(report.costGeneralization.length > 0);
  });

  it("Q. candidate validation from B-20", () => {
    const report = buildB21(stack());
    assert.ok(report.candidateValidation.length >= 5);
    assert.ok(
      report.candidateValidation.every((c) => c.evidenceStatus === "INSUFFICIENT_SAMPLE")
    );
  });

  it("R. temporal split label", () => {
    const report = buildB21(stack());
    assert.ok(report.temporalStability.every((t) => t.label === "TEMPORAL_DESCRIPTIVE_SPLIT"));
  });

  it("S–T. statistical quality", () => {
    const report = buildB21(stack());
    assert.equal(report.statisticalQuality.interpretWithCautionWhenNBelow10, true);
    assert.ok(report.statisticalQuality.correlationNote.includes("descriptive"));
  });

  it("U. geometry dependency", () => {
    const report = buildB21(stack());
    assert.ok(report.geometryDependency.statement.includes("geometry"));
    assert.equal(
      report.geometryDependency.perScope[0]?.validityClass,
      "POSSIBLY_REDUNDANT_GEOMETRY"
    );
  });

  it("V–X. evidence lists", () => {
    const report = buildB21(stack());
    assert.ok(report.directObservations.length > 0);
    assert.ok(report.associationalFindings.length > 0);
    assert.ok(report.counterfactualEvidence.length > 0);
  });

  it("Y. lookahead", () => {
    const report = buildB21(stack());
    assert.equal(report.lookaheadAttestation.outcomeFrom, "E+1");
  });

  it("Z. missing sections includes cross-symbol gap", () => {
    const report = buildB21(stack());
    assert.ok(report.missingSections.includes("CROSS_SYMBOL_FROZEN_STACK"));
  });

  it("AA. determinism", () => {
    const input = buildB21(stack());
    const pipe = stack();
    const a = buildHistoricalPhaseBMultiSymbolRegimeValidation({
      datasets: [pipe.dataset],
      lifecycleReports: { [BTC_SCOPE]: pipe.lifecycleReport },
      futureMoveAnalysisReports: { [BTC_SCOPE]: pipe.b14 },
      integratedEvidenceAudits: { [BTC_SCOPE]: pipe.b20 },
    });
    const b = buildHistoricalPhaseBMultiSymbolRegimeValidation({
      datasets: [pipe.dataset],
      lifecycleReports: { [BTC_SCOPE]: pipe.lifecycleReport },
      futureMoveAnalysisReports: { [BTC_SCOPE]: pipe.b14 },
      integratedEvidenceAudits: { [BTC_SCOPE]: pipe.b20 },
    });
    assert.deepEqual(a, b);
    assert.ok(input);
  });

  it("AB. immutability", () => {
    const pipe = stack();
    const input = deepFreeze({
      datasets: [pipe.dataset],
      lifecycleReports: { [BTC_SCOPE]: pipe.lifecycleReport },
    });
    buildHistoricalPhaseBMultiSymbolRegimeValidation(input);
    assert.ok(Object.isFrozen(input.datasets[0]));
  });

  it("AD. production decision", () => {
    const report = buildB21(stack());
    assert.equal(report.productionDecision.generalMarketRule, "NOT_ESTABLISHED");
  });

  it("AE. no optimizer language", () => {
    const json = JSON.stringify(buildB21(stack()));
    assert.ok(!/\bBEST\b/.test(json));
    assert.ok(!/\bOPTIMAL\b/.test(json));
  });

  it("AF. module guard", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-phase-b-multi-symbol-regime-validation.ts"),
      "utf8"
    );
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("fetch("));
  });

  it("AG. frozen integration", () => {
    const report = buildB21(stack());
    assert.equal(report.availableScopeKeys[0], BTC_SCOPE);
    assert.equal(report.symbolSummary[0]?.symbol, "BTCUSDT");
    assert.equal(PHASE_B_RESEARCH_PRIMARY_TIMEFRAME, "1H");
  });
});
