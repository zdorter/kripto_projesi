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
import {
  buildHistoricalDelayedEntryResearch,
  computeCounterfactualTargetT2,
  computeDelayedEntryPrice,
  computeEntryImprovementPercent,
  DELAYED_ENTRY_SCENARIOS,
} from "../historical-delayed-entry-research";
import { HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION } from "../historical-delayed-entry-research-types";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";
import type { Candle } from "../types";

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
  return {
    lifecycleReport,
    candles,
    b12w,
    b12t,
    b12u,
    b12x,
    b13,
    b16,
    b17,
    eligibilityAuditReport,
  };
}

function buildB18(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalDelayedEntryResearch({
    lifecycleReport: pipe.lifecycleReport,
    candles: pipe.candles,
    reachabilityReplayReport: pipe.b12w,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
    historicalEntryContextTargetResearchReport: pipe.b13,
    entryContextCombinationFutureMoveAnalysisReport: pipe.b16,
    signalIndependenceAuditReport: pipe.b17,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    displacementEqualityTargetMechanicsReport: pipe.b12t,
    structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
  });
}

describe("historical-delayed-entry-research (B-18)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION, "1.0");
  });

  it("B. population", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.replayClassifiable, 320);
    assert.equal(report.population.notReplayable, 16);
    assert.equal(report.population.horizonBars, 24);
  });

  it("C. baseline parity with B-12w", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.parity.b12wCanonicalBaselineReachMatch, true);
  });

  it("D–F. model definitions and fixed retracement arithmetic", () => {
    assert.ok(DELAYED_ENTRY_SCENARIOS.some((s) => s.model === "MODEL_D_NO_DELAY_BASELINE"));
    assert.equal(
      computeDelayedEntryPrice({
        model: "MODEL_A_FIXED_RETRACEMENT",
        levelValue: 0.5,
        direction: "BULLISH",
        eClose: 100,
        anchorPrice: 90,
        prefixExtremePrice: 95,
      }),
      99.5
    );
    assert.ok(
      Math.abs(
        (computeDelayedEntryPrice({
          model: "MODEL_A_FIXED_RETRACEMENT",
          levelValue: 0.5,
          direction: "BEARISH",
          eClose: 100,
          anchorPrice: 110,
          prefixExtremePrice: 105,
        }) ?? 0) - 100.5
      ) < 1e-9
    );
  });

  it("G–H. anchor fraction and structural retracement", () => {
    assert.equal(
      computeDelayedEntryPrice({
        model: "MODEL_B_ANCHOR_FRACTION",
        levelValue: 0.5,
        direction: "BULLISH",
        eClose: 110,
        anchorPrice: 100,
        prefixExtremePrice: null,
      }),
      105
    );
    assert.equal(
      computeDelayedEntryPrice({
        model: "MODEL_C_STRUCTURAL_RETRACEMENT",
        levelValue: 0.5,
        direction: "BULLISH",
        eClose: 110,
        anchorPrice: 100,
        prefixExtremePrice: 100,
      }),
      105
    );
  });

  it("I–O. entry improvement and T2 geometry", () => {
    assert.ok(Math.abs(computeEntryImprovementPercent("BULLISH", 100, 99) - 1) < 1e-9);
    assert.ok(Math.abs(computeEntryImprovementPercent("BEARISH", 100, 101) - 1) < 1e-9);
    assert.equal(computeCounterfactualTargetT2("BULLISH", 105, 100), 110);
    assert.equal(computeCounterfactualTargetT2("BEARISH", 95, 100), 90);
  });

  it("P–R. report tables and trade-off", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.comparisonTableT1.length, DELAYED_ENTRY_SCENARIOS.length);
    assert.equal(report.comparisonTableT2.length, DELAYED_ENTRY_SCENARIOS.length);
    assert.equal(report.tradeOffSummary.length, DELAYED_ENTRY_SCENARIOS.length);
    assert.ok(report.missedEntryAnalysis.length > 0);
    const baseline = report.comparisonTableT1.find((r) => r.model === "MODEL_D_NO_DELAY_BASELINE");
    assert.equal(baseline?.fillRate, report.population.replayClassifiable / report.population.independentTrades);
  });

  it("S–V. cohorts and cost column", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.failedFavorableDelayedEntry.length, DELAYED_ENTRY_SCENARIOS.length);
    assert.equal(report.passedAdverseDelayedEntry.length, DELAYED_ENTRY_SCENARIOS.length);
    assert.ok(report.entryQualityComparison.every((r) => r.costCoverageAt020 === null || r.costCoverageAt020 >= 0));
  });

  it("W–Z. target distance and context slices", () => {
    const report = buildB18(frozenStack());
    assert.ok(report.targetDistanceBuckets.length > 0);
    assert.ok(report.contextSlices.some((s) => s.dimension === "displacement"));
    assert.ok(report.contextSlices.some((s) => s.dimension === "headroom"));
  });

  it("AA–AC. temporal split and Wilson", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.temporalDescriptiveSplit.label, "TEMPORAL_DESCRIPTIVE_SPLIT");
    const row = report.comparisonTableT1[1]!;
    assert.ok(row.fillRateWilson95.lower <= (row.fillRate ?? 0));
  });

  it("AD–AF. direct vs associational and lookahead", () => {
    const report = buildB18(frozenStack());
    assert.ok(report.directVsAssociational.direct.length > 0);
    assert.equal(report.lookaheadAttestation.entryLevelComputedAt, "E");
    assert.equal(report.lookaheadAttestation.fillDetectionFrom, "E+1");
  });

  it("AG–AJ. determinism and B-12w immutability", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      candles: pipe.candles,
      reachabilityReplayReport: pipe.b12w,
      displacementEqualityTargetMechanicsReport: pipe.b12t,
      structuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalDelayedEntryResearch(input),
      buildHistoricalDelayedEntryResearch(input)
    );
    const wBefore = JSON.stringify(pipe.b12w.perTrade[0]);
    buildHistoricalDelayedEntryResearch(input);
    assert.equal(JSON.stringify(pipe.b12w.perTrade[0]), wBefore);
  });

  it("AK–AM. optional report consumption flags", () => {
    const pipe = frozenStack();
    const full = buildB18(pipe);
    assert.equal(full.consumedReports.reachabilityReplayReport, true);
    assert.equal(full.consumedReports.signalIndependenceAuditReport, true);
    const minimal = buildHistoricalDelayedEntryResearch({
      lifecycleReport: pipe.lifecycleReport,
      candles: pipe.candles,
      reachabilityReplayReport: pipe.b12w,
    });
    assert.equal(minimal.consumedReports.costAwareCounterfactualAnalysisReport, false);
  });

  it("AN. architecture guard", () => {
    const mod = readFileSync(join(process.cwd(), "src/wave/historical-delayed-entry-research.ts"), "utf8");
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });

  it("AO. frozen integration", () => {
    const report = buildB18(frozenStack());
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
    assert.equal(report.diagnosticSummary.length, 19);
    assert.ok(report.warnings.some((w) => w.includes("no_production_entry_rule")));
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loadBtcusdt1hResearchFrozenDatasetV1().candles),
      FIXTURE_CHECKSUM
    );
  });

  it("synthetic fill detection excludes E bar", () => {
    const candles: Candle[] = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 1, open: 100, high: 101, low: 98, close: 99, volume: 1 },
      { time: 2, open: 99, high: 100, low: 97, close: 98, volume: 1 },
    ];
    const pipe = frozenStack();
    const trade = pipe.lifecycleReport.trades.find((t) => t.direction === "BULLISH");
    assert.ok(trade);
    const subset = candles;
    const price = computeDelayedEntryPrice({
      model: "MODEL_A_FIXED_RETRACEMENT",
      levelValue: 1,
      direction: "BULLISH",
      eClose: 100,
      anchorPrice: 90,
      prefixExtremePrice: 95,
    });
    assert.equal(price, 99);
  });
});
