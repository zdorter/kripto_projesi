import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildHistoricalAlternativeTargetModelAnalysis,
  classifyCounterfactualGeometry,
  computeCounterfactualTargetRr,
  computeDisplacementCounterfactualTarget,
  computeStructuralExtensionCounterfactualTarget,
  computeStructuralPrefixCounterfactualTarget,
} from "../historical-alternative-target-model-analysis";
import { HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION } from "../historical-alternative-target-model-analysis-types";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "../historical-structural-extreme-vs-displacement-target-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { projectProspectiveOpenLegDisplacementEqualityTarget } from "../setup/prospective-open-leg-displacement-equality-policy";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

function unit(
  patch: Partial<IndependentTradeUnit> & { direction: "BULLISH" | "BEARISH" }
): IndependentTradeUnit {
  const id = patch.tradeId ?? "t1";
  return {
    tradeId: id,
    lifecycleSequence: 1,
    snapshotId: `snap:${id}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    evaluationBarIndex: 10,
    evaluationBarTime: null,
    prospectiveSetupId: "p1",
    sourceSetupId: null,
    direction: patch.direction,
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 110,
    invalidationReferencePrice: patch.invalidationReferencePrice ?? 95,
    canonicalRrRatio: patch.canonicalRrRatio ?? 2,
    snapshotCohorts: ["DISPLAY_PICK"],
    setupFamilyId: "FAM",
    tradeEvaluationStatus: patch.tradeEvaluationStatus ?? "PASSED",
    evaluatorFirstFailure: patch.evaluatorFirstFailure ?? null,
    pathOutcome: patch.pathOutcome ?? "TARGET_TOUCHED",
    policyClassification: patch.policyClassification ?? "FAVORABLE_RESOLUTION",
    lifecycleStatus: "OPEN_RESOLVED",
    exitBarIndex: 12,
    resolutionBarIndex: 12,
    barsAfterEvaluation: 2,
    lifecycleDurationBars: 2,
  };
}

function frozenStack() {
  const range = resolveRealHistoricalBacktestEvaluationRange(3000, 24);
  const result = runFrozenHistoricalBacktest({
    horizonBars: 24,
    startEvaluationBar: range.startEvaluationBar,
    endEvaluationBar: range.endEvaluationBar,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  const lifecycleReport = buildIndependentTradeLifecycleReport({
    report: result.report,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  });
  const stats = aggregateIndependentTradeStatistics(lifecycleReport);
  const rStats = aggregateIndependentTradeRMultipleStatistics({
    lifecycleReport,
    statisticsReport: stats,
  });
  const audit = auditIndependentTradeTheoreticalREligibility({
    lifecycleReport,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
  });
  return { result, lifecycleReport, stats, audit };
}

describe("historical-alternative-target-model-analysis (B-12v)", () => {
  it("A. schema", () => {
    assert.equal(HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION, "1.0");
  });

  it("B. frozen population parity", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.population.independentTrades, pipe.lifecycleReport.trades.length);
    assert.equal(report.population.lifecycleSummary.independentTrades, pipe.lifecycleReport.summary.independentTrades);
  });

  it("C. canonical 1.00 displacement parity", () => {
    const t = computeDisplacementCounterfactualTarget(105, 100, "BULLISH", 1);
    assert.equal(t, projectProspectiveOpenLegDisplacementEqualityTarget(100, 105));
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(
      report.parity.canonicalDisplacementMultiplier1ParityTrades,
      pipe.lifecycleReport.trades.length
    );
  });

  it("D–I. displacement and structural models", () => {
    assert.equal(computeDisplacementCounterfactualTarget(100, 95, "BULLISH", 2), 110);
    assert.equal(computeStructuralPrefixCounterfactualTarget(100, 104, 98, "BULLISH"), 104);
    assert.equal(
      computeStructuralExtensionCounterfactualTarget(100, 104, 98, "BULLISH", 2),
      108
    );
  });

  it("J. structural extension", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    const ext = report.modelComparison.find((m) => m.modelId === "STRUCTURAL_EXTENSION_1_00");
    assert.ok((ext?.classifiableTrades ?? 0) > 0);
  });

  it("K–L. bullish and bearish geometry", () => {
    assert.equal(
      classifyCounterfactualGeometry("BULLISH", 100, 110, 95),
      "VALID_GEOMETRY"
    );
    assert.equal(
      classifyCounterfactualGeometry("BEARISH", 100, 90, 105),
      "VALID_GEOMETRY"
    );
  });

  it("M–N. invalid geometry and risk", () => {
    assert.equal(
      classifyCounterfactualGeometry("BULLISH", 100, 99, 95),
      "INVALID_GEOMETRY"
    );
    assert.equal(
      computeCounterfactualTargetRr("BULLISH", 100, 110, 100).riskStatus,
      "INVALID_RISK_REFERENCE"
    );
  });

  it("O–P. reward and RR on synthetic trade", () => {
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 105,
            invalidationReferencePrice: 97.5,
            canonicalRrRatio: 2,
          }),
        ],
        entryRejections: [],
      },
      artifactMeasurements: [
        {
          snapshotId: "snap:t1",
          evaluation: {
            production: {
              openLegResolution: {
                leg: { anchorPrice: 95, observedHigh: 104, observedLow: 98 },
              },
            },
          } as never,
        } as never,
      ],
    });
    const canon = report.perTrade[0]!.models.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )!;
    assert.equal(canon.rewardPercentage, 5);
    assert.equal(canon.counterfactualTargetRr, 2);
  });

  it("Q. model comparison populated", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.modelComparison.length, 11);
  });

  it("R. headroom cross", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.structuralHeadroomComparison.length >= 5);
  });

  it("S. FAILED + favorable", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.failedFavorableAnalysis.trades > 0);
    assert.ok(report.failedFavorableAnalysis.rrBelowMinimum > 0);
  });

  it("T. PASSED + adverse", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.passedAdverseAnalysis.trades >= 0);
  });

  it("U–X. direction, family, wave, anchor", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.directionCross.length > 0);
    assert.ok(report.setupFamilyCross.length > 0);
    assert.ok(report.waveContextCross.length > 0);
    assert.ok(report.anchorSourceCross.length > 0);
  });

  it("Y. large target counts", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    const d3 = report.largeTargetContext.find((m) => m.modelId === "DISPLACEMENT_3_00");
    assert.ok(d3);
    assert.ok(d3!.gte1 >= 0 && d3!.gte3 >= 0);
  });

  it("Z. no false alternative WIN/LOSS", () => {
    const pipe = frozenStack();
    const report = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    for (const row of report.perTrade) {
      for (const m of row.models) {
        assert.equal(m.alternativeTheoreticalR, null);
        assert.equal(m.pathOutcomeComparability.alternativeOutcomeInference, "NOT_INFERRED");
        assert.equal(m.reachability.status, "NOT_MEASURABLE");
      }
    }
  });

  it("AA. no path replay in module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-alternative-target-model-analysis.ts"),
      "utf8"
    );
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
  });

  it("AB. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      eligibilityAuditReport: pipe.audit,
    };
    assert.deepEqual(
      buildHistoricalAlternativeTargetModelAnalysis(input),
      buildHistoricalAlternativeTargetModelAnalysis(input)
    );
  });

  it("AC. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({ lc: pipe.lifecycleReport, audit: pipe.audit, stats: pipe.stats });
    buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      eligibilityAuditReport: pipe.audit,
    });
    assert.equal(JSON.stringify({ lc: pipe.lifecycleReport, audit: pipe.audit, stats: pipe.stats }), before);
  });

  it("AD. B-12u 121 parity", () => {
    const pipe = frozenStack();
    const b12v = buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    const b12u = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(
      b12v.parity.b12uPrefixBeyondCanonicalTargetCount,
      b12u.structuralBeyondCanonicalSummary.prefixExtremeBeyondCanonicalTargetCount
    );
    assert.equal(b12v.parity.b12uPrefixBeyondCanonicalTargetCount, 121);
  });

  it("AE. architecture guard", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/historical-alternative-target-model-analysis.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalAlternativeTargetModelAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetch("));
  });
});
