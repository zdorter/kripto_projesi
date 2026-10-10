import { createHash } from "node:crypto";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "./historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "./historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "./historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "./historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalEntryContextCombinationFutureMoveAnalysis } from "./historical-entry-context-combination-future-move-analysis";
import { buildHistoricalEntryContextFutureMoveAnalysis } from "./historical-entry-context-future-move-analysis";
import { buildHistoricalEntryContextFutureMovePredictivenessAnalysis } from "./historical-entry-context-future-move-predictiveness-analysis";
import { buildHistoricalEntryContextSignalIndependenceAudit } from "./historical-entry-context-signal-independence-audit";
import { buildHistoricalEntryContextTargetResearch } from "./historical-entry-context-target-research";
import { buildHistoricalEntryPriceMoveQualityAnalysis } from "./historical-entry-price-move-quality-analysis";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "./historical-evaluator-rr-threshold-theoretical-r-analysis";
import { buildHistoricalDelayedEntryResearch } from "./historical-delayed-entry-research";
import { buildHistoricalDelayedEntryDecisionAudit } from "./historical-delayed-entry-decision-audit";
import { buildHistoricalPhaseBIntegratedEvidenceAudit } from "./historical-phase-b-integrated-evidence-audit";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "./historical-structural-extreme-vs-displacement-target-analysis";
import { buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis } from "./historical-target-distance-reachability-cost-balance-analysis";
import { buildHistoricalTargetDistanceStructuralContextAnalysis } from "./historical-target-distance-structural-context-analysis";
import { buildHistoricalTargetProvenanceStructuralDistanceAnalysis } from "./historical-target-provenance-structural-distance-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "./historical-independent-trade-r-eligibility-audit";
import {
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
  type MultiSymbol1hResearchFrozenSymbol,
} from "./historical-frozen-ohlcv-dataset-types";
import {
  loadHistoricalResearchDatasetManifestV1,
  loadMultiSymbol1hResearchFrozenDatasetV1,
  toPhaseBResearchDatasetRefFromLoaded,
} from "./historical-research-dataset-manifest";
import { runFrozenHistoricalBacktest } from "./frozen-historical-backtest";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "./independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle";
import { phaseBResearchScopeKey } from "./historical-phase-b-multi-symbol-regime-validation";
import type { BuildHistoricalPhaseBMultiSymbolRegimeValidationInput } from "./historical-phase-b-multi-symbol-regime-validation-types";
import type { PhaseBResearchScopeKey } from "./historical-phase-b-multi-symbol-regime-validation-types";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORICAL_PHASE_B_FROZEN_EVIDENCE_STACK_SCHEMA_VERSION,
  HISTORICAL_PHASE_B_MULTISYMBOL_EVIDENCE_ARTIFACT_V1_RELATIVE_PATH,
  type HistoricalPhaseBFrozenEvidenceStack,
  type HistoricalPhaseBMultisymbolEvidenceArtifactV1,
  type HistoricalPhaseBMultisymbolFrozenEvidenceStacksResult,
  type PhaseBEvidenceStackFingerprint,
  type PhaseBFrozenEvidenceStackFailure,
  type PhaseBFrozenEvidenceStackFailureCode,
} from "./historical-phase-b-frozen-evidence-stack-types";
import { resolveRealHistoricalBacktestEvaluationRange } from "./real-historical-backtest";

export const EXPECTED_MANIFEST_CHECKSUMS: Readonly<Record<MultiSymbol1hResearchFrozenSymbol, string>> = {
  BTCUSDT: "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc",
  ETHUSDT: "07dad17c19e8a60673f8be944f68bb25cd1dbc4d71f6e8789e998c835914c754",
  BNBUSDT: "dd3cb52be51517bf5f2f39d8d670ddd452e4c22b36cd9eb6524be6ddcff2dc7f",
  SOLUSDT: "5abaccd062472da3030e12176ccb6172c63c0569cbe10dc07bcd76d7e61b6f5a",
  XRPUSDT: "05d6e541d7e467fc6db42ce95f2019216ca25afaaf37ac12ae31001aab57d6ff",
  ADAUSDT: "bf970de0e9cac093e2b8d82932bddfff25bcb72449f2ac23bcc3398a0d50f87b",
};

function fingerprintDigest(parts: Record<string, string | number | null>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function buildFingerprint(
  stack: Omit<HistoricalPhaseBFrozenEvidenceStack, "fingerprint"> & {
    fingerprint?: never;
  }
): PhaseBEvidenceStackFingerprint {
  const canon = stack.reachabilityReplayReport.modelResults.find(
    (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
  );
  const b14t1 = stack.futureMoveAnalysisReport.thresholdAnalysis.find((t) => t.thresholdPercent === 1);
  const b12x020 = stack.costAwareCounterfactualAnalysisReport.modelResults.find(
    (m) =>
      m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && Math.abs(m.roundTripCostPercentage - 0.2) < 1e-9
  );
  const b19d = stack.delayedEntryDecisionAuditReport.decisionComparisonTable.find(
    (r) => r.model === "MODEL_D_NO_DELAY_BASELINE"
  );
  const parts = {
    scopeKey: stack.scopeKey,
    datasetChecksum: stack.dataset.datasetChecksum,
    independentTrades: stack.lifecycleReport.trades.length,
    replayClassifiable: canon?.classifiableTrades ?? null,
    notReplayable: canon?.notReplayable ?? null,
    b14Threshold1ReachedCount: b14t1?.futureMoveReachedCount ?? 0,
    b14Threshold1ReachRate: b14t1?.futureMoveReachRate ?? null,
    b12wCanonicalTargetReachRate: canon?.targetReachRate ?? null,
    b12xCostCoverageAt020: b12x020?.costCoveredTargetRate ?? null,
    b19ModelDBuselineFillRate: b19d?.fillRate ?? null,
    b20MissingSectionsCount: stack.integratedEvidenceAuditReport.missingSections.length,
    b20ProductionRuleStatus: stack.integratedEvidenceAuditReport.productionDecision.productionRuleStatus,
  };
  return {
    scopeKey: stack.scopeKey,
    symbol: stack.symbol,
    timeframe: stack.timeframe,
    datasetChecksum: stack.dataset.datasetChecksum,
    candleCount: stack.dataset.candleCount,
    independentTrades: stack.lifecycleReport.trades.length,
    replayClassifiable: canon?.classifiableTrades ?? null,
    notReplayable: canon?.notReplayable ?? null,
    horizonBars: stack.integratedEvidenceAuditReport.population.horizonBars,
    b14Threshold1ReachRate: parts.b14Threshold1ReachRate,
    b14Threshold1ReachedCount: parts.b14Threshold1ReachedCount,
    b12wCanonicalTargetReachRate: parts.b12wCanonicalTargetReachRate,
    b12xCostCoverageAt020: parts.b12xCostCoverageAt020,
    b19ModelDBuselineFillRate: parts.b19ModelDBuselineFillRate,
    b20MissingSectionsCount: parts.b20MissingSectionsCount,
    b20ProductionRuleStatus: parts.b20ProductionRuleStatus,
    fingerprintDigest: fingerprintDigest(parts),
  };
}

export function buildHistoricalPhaseBFrozenEvidenceStackForSymbol(
  symbol: MultiSymbol1hResearchFrozenSymbol,
  cwd: string = process.cwd()
): HistoricalPhaseBFrozenEvidenceStack {
  const scopeKey = phaseBResearchScopeKey(symbol, "1H");
  const fixturePath = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
  const expectedChecksum = EXPECTED_MANIFEST_CHECKSUMS[symbol];

  try {
    const loaded = loadMultiSymbol1hResearchFrozenDatasetV1(symbol, cwd);
    const m = loaded.document.metadata;
    if (m.datasetChecksum !== expectedChecksum) {
      throw Object.assign(new Error(`DATASET_CHECKSUM_MISMATCH for ${symbol}`), {
        code: "DATASET_CHECKSUM_MISMATCH" as PhaseBFrozenEvidenceStackFailureCode,
      });
    }
    if (loaded.candles.length !== RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT) {
      throw Object.assign(new Error(`INSUFFICIENT_CANDLES for ${symbol}`), {
        code: "INSUFFICIENT_CANDLES" as PhaseBFrozenEvidenceStackFailureCode,
      });
    }

    const dataset = toPhaseBResearchDatasetRefFromLoaded(loaded, fixturePath);
    const candles = loaded.candles;
    const range = resolveRealHistoricalBacktestEvaluationRange(candles.length, 24);
    const result = runFrozenHistoricalBacktest({
      symbol,
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
      entryPriceMoveQualityAnalysisReport: b12r,
      structuralContextAnalysisReport: b12y,
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
    const integratedEvidenceAuditReport = buildHistoricalPhaseBIntegratedEvidenceAudit({
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

    const base = {
      scopeKey,
      symbol,
      timeframe: "1H" as const,
      status: "PASS" as const,
      failureCode: null,
      failureMessage: null,
      dataset,
      loaded,
      candles,
      lifecycleReport,
      eligibilityAuditReport,
      rrThresholdTheoreticalRAnalysisReport: b12p,
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
      integratedEvidenceAuditReport,
    };
    const fingerprint = buildFingerprint(base);
    return { ...base, fingerprint };
  } catch (err) {
    const code: PhaseBFrozenEvidenceStackFailureCode =
      err && typeof err === "object" && "code" in err && typeof (err as { code: string }).code === "string"
        ? ((err as { code: PhaseBFrozenEvidenceStackFailureCode }).code ?? "STACK_BUILD_ERROR")
        : "STACK_BUILD_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`Stack failed for ${symbol}: ${message}`), { code });
  }
}

function stackToB21Maps(
  stacks: readonly HistoricalPhaseBFrozenEvidenceStack[]
): BuildHistoricalPhaseBMultiSymbolRegimeValidationInput {
  const passStacks = stacks.filter((s) => s.status === "PASS");
  const datasets = passStacks.map((s) => s.dataset);
  const put = <T>(map: Partial<Record<PhaseBResearchScopeKey, T>>, s: HistoricalPhaseBFrozenEvidenceStack, v: T) => {
    map[s.scopeKey] = v;
  };
  const lifecycleReports: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["lifecycleReports"] = {};
  const eligibilityAuditReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["eligibilityAuditReports"]
  > = {};
  const historicalEntryPriceMoveQualityAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["historicalEntryPriceMoveQualityAnalysisReports"]
  > = {};
  const historicalTargetProvenanceStructuralDistanceAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["historicalTargetProvenanceStructuralDistanceAnalysisReports"]
  > = {};
  const displacementEqualityTargetMechanicsReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["displacementEqualityTargetMechanicsReports"]
  > = {};
  const structuralExtremeVsDisplacementTargetReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["structuralExtremeVsDisplacementTargetReports"]
  > = {};
  const alternativeTargetModelAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["alternativeTargetModelAnalysisReports"]
  > = {};
  const reachabilityReplayReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["reachabilityReplayReports"]
  > = {};
  const costAwareCounterfactualAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["costAwareCounterfactualAnalysisReports"]
  > = {};
  const historicalTargetDistanceStructuralContextAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["historicalTargetDistanceStructuralContextAnalysisReports"]
  > = {};
  const historicalTargetDistanceReachabilityCostBalanceAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["historicalTargetDistanceReachabilityCostBalanceAnalysisReports"]
  > = {};
  const historicalEntryContextTargetResearchReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["historicalEntryContextTargetResearchReports"]
  > = {};
  const futureMoveAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["futureMoveAnalysisReports"]
  > = {};
  const futureMovePredictivenessAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["futureMovePredictivenessAnalysisReports"]
  > = {};
  const entryContextCombinationFutureMoveAnalysisReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["entryContextCombinationFutureMoveAnalysisReports"]
  > = {};
  const signalIndependenceAuditReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["signalIndependenceAuditReports"]
  > = {};
  const delayedEntryResearchReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["delayedEntryResearchReports"]
  > = {};
  const delayedEntryDecisionAuditReports: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["delayedEntryDecisionAuditReports"]
  > = {};
  const integratedEvidenceAudits: NonNullable<
    BuildHistoricalPhaseBMultiSymbolRegimeValidationInput["integratedEvidenceAudits"]
  > = {};

  for (const s of passStacks) {
    put(lifecycleReports, s, s.lifecycleReport);
    put(eligibilityAuditReports, s, s.eligibilityAuditReport);
    put(historicalEntryPriceMoveQualityAnalysisReports, s, s.historicalEntryPriceMoveQualityAnalysisReport);
    put(
      historicalTargetProvenanceStructuralDistanceAnalysisReports,
      s,
      s.historicalTargetProvenanceStructuralDistanceAnalysisReport
    );
    put(displacementEqualityTargetMechanicsReports, s, s.displacementEqualityTargetMechanicsReport);
    put(structuralExtremeVsDisplacementTargetReports, s, s.structuralExtremeVsDisplacementTargetReport);
    put(alternativeTargetModelAnalysisReports, s, s.alternativeTargetModelAnalysisReport);
    put(reachabilityReplayReports, s, s.reachabilityReplayReport);
    put(costAwareCounterfactualAnalysisReports, s, s.costAwareCounterfactualAnalysisReport);
    put(
      historicalTargetDistanceStructuralContextAnalysisReports,
      s,
      s.historicalTargetDistanceStructuralContextAnalysisReport
    );
    put(
      historicalTargetDistanceReachabilityCostBalanceAnalysisReports,
      s,
      s.historicalTargetDistanceReachabilityCostBalanceAnalysisReport
    );
    put(historicalEntryContextTargetResearchReports, s, s.historicalEntryContextTargetResearchReport);
    put(futureMoveAnalysisReports, s, s.futureMoveAnalysisReport);
    put(futureMovePredictivenessAnalysisReports, s, s.futureMovePredictivenessAnalysisReport);
    put(entryContextCombinationFutureMoveAnalysisReports, s, s.entryContextCombinationFutureMoveAnalysisReport);
    put(signalIndependenceAuditReports, s, s.signalIndependenceAuditReport);
    put(delayedEntryResearchReports, s, s.delayedEntryResearchReport);
    put(delayedEntryDecisionAuditReports, s, s.delayedEntryDecisionAuditReport);
    put(integratedEvidenceAudits, s, s.integratedEvidenceAuditReport);
  }

  return {
    datasets,
    lifecycleReports,
    eligibilityAuditReports,
    historicalEntryPriceMoveQualityAnalysisReports,
    historicalTargetProvenanceStructuralDistanceAnalysisReports,
    displacementEqualityTargetMechanicsReports,
    structuralExtremeVsDisplacementTargetReports,
    alternativeTargetModelAnalysisReports,
    reachabilityReplayReports,
    costAwareCounterfactualAnalysisReports,
    historicalTargetDistanceStructuralContextAnalysisReports,
    historicalTargetDistanceReachabilityCostBalanceAnalysisReports,
    historicalEntryContextTargetResearchReports,
    futureMoveAnalysisReports,
    futureMovePredictivenessAnalysisReports,
    entryContextCombinationFutureMoveAnalysisReports,
    signalIndependenceAuditReports,
    delayedEntryResearchReports,
    delayedEntryDecisionAuditReports,
    integratedEvidenceAudits,
  };
}

function buildArtifact(stacks: readonly HistoricalPhaseBFrozenEvidenceStack[]): HistoricalPhaseBMultisymbolEvidenceArtifactV1 {
  return {
    schemaVersion: "1.0",
    generatedNote: "B-23 per-symbol evidence stack fingerprints; full reports are runtime-only.",
    scopes: stacks.map((s) => ({
      scopeKey: s.scopeKey,
      symbol: s.symbol,
      timeframe: s.timeframe,
      datasetChecksum: s.dataset.datasetChecksum,
      candleCount: s.dataset.candleCount,
      firstTimestamp: s.dataset.firstTimestamp,
      lastTimestamp: s.dataset.lastTimestamp,
      stackStatus: s.status,
      failureCode: s.failureCode,
      fingerprintDigest: s.fingerprint.fingerprintDigest,
      reportAvailability: {
        b12ThroughB20: s.status === "PASS",
        integratedEvidence: s.status === "PASS" && s.integratedEvidenceAuditReport.missingSections.length === 0,
        missingSectionsCount: s.integratedEvidenceAuditReport.missingSections.length,
      },
    })),
  };
}

export function writeHistoricalPhaseBMultisymbolEvidenceArtifactV1(
  artifact: HistoricalPhaseBMultisymbolEvidenceArtifactV1,
  cwd: string = process.cwd()
): string {
  const path = join(cwd, HISTORICAL_PHASE_B_MULTISYMBOL_EVIDENCE_ARTIFACT_V1_RELATIVE_PATH);
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return path;
}

export function buildHistoricalPhaseBMultisymbolFrozenEvidenceStacks(
  cwd: string = process.cwd()
): HistoricalPhaseBMultisymbolFrozenEvidenceStacksResult {
  loadHistoricalResearchDatasetManifestV1(cwd);
  const stacks: HistoricalPhaseBFrozenEvidenceStack[] = [];
  const failures: PhaseBFrozenEvidenceStackFailure[] = [];

  for (const symbol of MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS) {
    try {
      stacks.push(buildHistoricalPhaseBFrozenEvidenceStackForSymbol(symbol, cwd));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code: PhaseBFrozenEvidenceStackFailureCode =
        err && typeof err === "object" && "code" in err
          ? ((err as { code: PhaseBFrozenEvidenceStackFailureCode }).code ?? "STACK_BUILD_ERROR")
          : "STACK_BUILD_ERROR";
      failures.push({
        symbol,
        scopeKey: phaseBResearchScopeKey(symbol, "1H"),
        failureCode: code,
        message,
      });
    }
  }

  const stacksByScope: Partial<Record<PhaseBResearchScopeKey, HistoricalPhaseBFrozenEvidenceStack>> = {};
  for (const s of stacks) {
    stacksByScope[s.scopeKey] = s;
  }

  const b21Input = stackToB21Maps(stacks);
  const artifact = buildArtifact(stacks);

  return {
    schemaVersion: HISTORICAL_PHASE_B_FROZEN_EVIDENCE_STACK_SCHEMA_VERSION,
    stacks,
    failures,
    stacksByScope,
    b21Input,
    artifact,
  };
}
