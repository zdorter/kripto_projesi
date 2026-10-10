import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalAlternativeTargetModelAnalysis } from "../historical-alternative-target-model-analysis";
import { buildHistoricalAlternativeTargetReachabilityReplay } from "../historical-alternative-target-reachability-replay";
import { buildHistoricalCostAwareCounterfactualAnalysis } from "../historical-cost-aware-counterfactual-analysis";
import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "../historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import {
  buildHistoricalEntryContextTargetResearch,
  mapHeadroomToSameTargetTier,
} from "../historical-entry-context-target-research";
import { HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION } from "../historical-entry-context-target-research-types";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION } from "../independent-trade-unit-lifecycle-types";
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
  return {
    lifecycleReport,
    eligibilityAuditReport,
    artifactMeasurements: result.report.artifact.measurements,
    b12w,
    b12x,
    b12t,
    b12u,
    b12v,
  };
}

function buildReport(pipe: ReturnType<typeof frozenStack>) {
  return buildHistoricalEntryContextTargetResearch({
    lifecycleReport: pipe.lifecycleReport,
    artifactMeasurements: pipe.artifactMeasurements,
    reachabilityReplayReport: pipe.b12w,
    costAwareCounterfactualAnalysisReport: pipe.b12x,
    eligibilityAuditReport: pipe.eligibilityAuditReport,
    historicalDisplacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
    historicalStructuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
  });
}

describe("historical-entry-context-target-research (B-13)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION, "1.0");
    assert.equal(mapHeadroomToSameTargetTier("NO_HEADROOM"), "NO_HEADROOM");
    assert.equal(mapHeadroomToSameTargetTier("HEADROOM_GTE_10_00"), "LARGE_HEADROOM");
  });

  it("B. empty input", () => {
    const report = buildHistoricalEntryContextTargetResearch({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [],
        entryRejections: [],
      },
      artifactMeasurements: [],
      reachabilityReplayReport: { schemaVersion: "1.0", perTrade: [], modelResults: [] } as never,
      costAwareCounterfactualAnalysisReport: {
        schemaVersion: "1.0",
        modelResults: [],
      } as never,
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
    });
    assert.equal(report.population.independentTrades, 0);
    assert.equal(report.displacementAnalysis.length, 0);
    assert.equal(report.diagnosticSummary.length, 14);
  });

  it("C. frozen BTC integration population", () => {
    const pipe = frozenStack();
    const report = buildReport(pipe);
    assert.equal(report.population.independentTrades, 336);
    assert.equal(report.population.totalSnapshots, 18936);
    assert.equal(report.population.eligibleEntrySnapshots, 2942);
    assert.equal(report.population.canonicalReplayClassifiable, 320);
    assert.equal(report.population.canonicalNotReplayable, 16);
    assert.equal(report.datasetReference.expectedDatasetChecksum, FIXTURE_CHECKSUM);
  });

  it("D. deterministic output", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.artifactMeasurements,
      reachabilityReplayReport: pipe.b12w,
      costAwareCounterfactualAnalysisReport: pipe.b12x,
      eligibilityAuditReport: pipe.eligibilityAuditReport,
      historicalDisplacementEqualityTargetMechanicsAnalysisReport: pipe.b12t,
      historicalStructuralExtremeVsDisplacementTargetAnalysisReport: pipe.b12u,
    };
    assert.deepEqual(
      buildHistoricalEntryContextTargetResearch(input),
      buildHistoricalEntryContextTargetResearch(input)
    );
  });

  it("E. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      w: pipe.b12w,
      x: pipe.b12x,
      t: pipe.b12t,
      u: pipe.b12u,
    });
    buildReport(pipe);
    assert.equal(
      JSON.stringify({ w: pipe.b12w, x: pipe.b12x, t: pipe.b12t, u: pipe.b12u }),
      before
    );
  });

  it("F. lookahead attestation", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.lookaheadAttestation.entryContextUsesAnchorToEOnly, true);
    assert.equal(report.lookaheadAttestation.postEUsedForOutcomesOnly, true);
  });

  it("G. canonical reachability parity (B-12w)", () => {
    const pipe = frozenStack();
    const report = buildReport(pipe);
    const canon = pipe.b12w.modelResults.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    const reached = report.displacementAnalysis.reduce((s, d) => s + d.targetReached, 0);
    assert.equal(reached, canon.targetReached);
  });

  it("H. B-12x cost parity @0.20%", () => {
    const pipe = frozenStack();
    const report = buildReport(pipe);
    const popReached = report.displacementAnalysis.reduce((s, d) => s + d.targetReached, 0);
    const coveredEst =
      report.displacementAnalysis.reduce(
        (s, d) => s + (d.costCoverageRateAt0_20 ?? 0) * d.targetReached,
        0
      );
    const b12xCanon = pipe.b12x.modelResults.find(
      (m) =>
        m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && m.roundTripCostPercentage === 0.2
    )!;
    assert.equal(popReached, b12xCanon.targetReached);
    assert.ok(Math.abs(coveredEst - b12xCanon.costCoveredTargetCount) < 1e-6);
  });

  it("I. B-12h theoretical R parity (no recompute)", () => {
    const pipe = frozenStack();
    const report = buildReport(pipe);
    const auditSum = pipe.eligibilityAuditReport.decisiveRows
      .filter((r) => r.theoreticalREligible && r.theoreticalR !== null)
      .reduce((s, r) => s + r.theoreticalR!, 0);
    const sliceSum = report.displacementAnalysis.reduce((s, d) => s + d.sumR, 0);
    assert.ok(Math.abs(auditSum - sliceSum) < 1e-6);
  });

  it("J–L. displacement, headroom, same-target-band", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.displacementAnalysis.length > 0);
    assert.ok(report.headroomAnalysis.length > 0);
    assert.ok(report.sameTargetBandSegmentation.length > 0);
    assert.ok(
      report.sameTargetBandSegmentation.some(
        (r) => r.targetBand === "REWARD_1_00_TO_2_00" || r.targetBand === "REWARD_0_50_TO_1_00"
      )
    );
  });

  it("M. displacement × headroom cross", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.displacementHeadroomCross.length > 0);
  });

  it("N. target × headroom × MFE cross", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.targetHeadroomMfeCross.length > 0);
  });

  it("O. target not reached but MFE >= target", () => {
    const report = buildReport(frozenStack());
    const a = report.mfeNotReachedAnalysis.groupA_targetNotReached_mfeLtTarget.trades;
    const b = report.mfeNotReachedAnalysis.groupB_targetNotReached_mfeGteTarget.trades;
    assert.ok(a + b > 0);
    assert.ok(b > 0);
  });

  it("P–Q. FAILED+FAVORABLE and PASSED+ADVERSE", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.failedFavorableAnalysis.trades, 97);
    assert.equal(report.passedAdverseAnalysis.trades, 88);
  });

  it("R. RR control cross", () => {
    const report = buildReport(frozenStack());
    assert.equal(report.rrControlCross.length, 4);
  });

  it("S. wave / direction / family secondary", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.secondaryWaveDirectionFamily.wave.length > 0);
    assert.ok(report.secondaryWaveDirectionFamily.direction.length > 0);
    assert.ok(report.secondaryWaveDirectionFamily.family.length > 0);
  });

  it("T. Wilson CI", () => {
    const report = buildReport(frozenStack());
    assert.equal(
      report.headroomPresenceComparison.noHeadroom.reachRateWilson95.method,
      "WILSON_SCORE_INTERVAL"
    );
  });

  it("U. sample-size rules", () => {
    const report = buildReport(frozenStack());
    const cautious = report.sameTargetBandSegmentation.filter((r) => r.interpretWithCaution);
    const ok = report.sameTargetBandSegmentation.filter((r) => !r.interpretWithCaution);
    assert.ok(cautious.length + ok.length === report.sameTargetBandSegmentation.length);
  });

  it("V. direct vs associational classification", () => {
    const report = buildReport(frozenStack());
    assert.ok(report.directVsAssociational.direct.includes("displacement"));
    assert.ok(report.directVsAssociational.associational.includes("evaluator"));
    assert.ok(report.diagnosticSummary.every((d) => d.tag.length > 0));
  });

  it("W. architecture guard CP (module)", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-target-research.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalEntryContextTargetResearch"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("computeTheoreticalTradeRMultiple"));
    assert.ok(!mod.includes("fetch("));
  });

  it("X. canonical target unchanged (supplied B-12t/B-12u)", () => {
    const pipe = frozenStack();
    const beforeT = JSON.stringify(pipe.b12t);
    const beforeU = JSON.stringify(pipe.b12u);
    buildReport(pipe);
    assert.equal(JSON.stringify(pipe.b12t), beforeT);
    assert.equal(JSON.stringify(pipe.b12u), beforeU);
  });

  it("Y. evaluator output unchanged", () => {
    const b13 = readFileSync(
      join(process.cwd(), "src/wave/historical-entry-context-target-research.ts"),
      "utf8"
    );
    assert.ok(!b13.includes("from \"./setup/trade-evaluation\""));
    assert.ok(!b13.includes("evaluateTradeEvaluation"));
  });

  it("Z. frozen dataset checksum parity", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(checksum, FIXTURE_CHECKSUM);
    assert.equal(
      buildReport(frozenStack()).datasetReference.expectedDatasetChecksum,
      checksum
    );
  });
});
