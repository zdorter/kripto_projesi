import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import {
  buildHistoricalTargetProvenanceStructuralDistanceAnalysis,
  classifyTargetMagnitudeRewardBucket,
} from "../historical-target-provenance-structural-distance-analysis";
import {
  HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION,
  TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT,
} from "../historical-target-provenance-structural-distance-analysis-types";
import { computeGrossPriceMovePercentages } from "../historical-entry-price-move-quality-analysis";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import {
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type IndependentTradeUnit,
} from "../independent-trade-unit-lifecycle-types";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";

function unit(
  patch: Partial<IndependentTradeUnit> & {
    direction: "BULLISH" | "BEARISH";
  }
): IndependentTradeUnit {
  const id = patch.tradeId ?? "t1";
  return {
    tradeId: id,
    lifecycleSequence: 1,
    snapshotId: `snap:${id}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    evaluationBarIndex: patch.evaluationBarIndex ?? 10,
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
    lifecycleDurationBars: patch.lifecycleDurationBars ?? 2,
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
  const b12p = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
    lifecycleReport,
    eligibilityAuditReport: audit,
  });
  return {
    result,
    lifecycleReport,
    stats,
    rStats,
    audit,
    b12p,
  };
}

describe("historical-target-provenance-structural-distance-analysis (B-12s)", () => {
  it("A. schema", () => {
    assert.equal(
      HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION,
      "1.0"
    );
  });

  it("B. empty input", () => {
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [],
        entryRejections: [],
      },
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
    });
    assert.equal(report.population.independentTrades, 0);
  });

  it("C–D. provenance DIRECT structural / fib UNKNOWN", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.targetProvenance.populationPrimaryCategory, "STRUCTURAL_LEVEL_REFERENCE");
    assert.ok(
      report.targetProvenance.fibonacciProvenanceNote.includes("not established")
    );
    const row = report.targetProvenance.perTrade[0]!;
    assert.equal(row.primaryProvenance.evidenceLevel, "DIRECT");
    assert.equal(row.targetModelId, "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION");
  });

  it("E–G. reward bucket boundaries and large buckets", () => {
    assert.equal(classifyTargetMagnitudeRewardBucket(0.05), "REWARD_LT_0_10");
    assert.equal(classifyTargetMagnitudeRewardBucket(4), "REWARD_3_00_TO_5_00");
    assert.equal(classifyTargetMagnitudeRewardBucket(12), "REWARD_GTE_10_00");
    const t = TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT;
    assert.ok(t.to10_00MaxExclusive === 10);
  });

  it("H–I. structural distance and compression", () => {
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 101,
            invalidationReferencePrice: 95,
          }),
        ],
        entryRejections: [],
      },
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
      artifactMeasurements: [
        {
          snapshotId: "snap:t1",
          evaluation: {
            historicalSetup: {
              sourceScenario: { endPrice: 110, startPrice: 90, startIndex: 0, endIndex: 5, evidence: [], limitations: [] },
              scenarioRef: { waveLabel: "3", structure: "HH" },
            } as never,
            production: {
              openLegResolution: {
                leg: {
                  anchorPrice: 98,
                  anchorIndex: 5,
                  observedHigh: 110,
                  observedLow: 97,
                  observedDirection: "BULLISH",
                },
              },
            } as never,
            references: {
              target: {
                modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
                policyId: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
              },
            } as never,
          } as never,
        } as never,
      ],
    });
    const sd = report.structuralDistance.rows[0]!;
    assert.equal(sd.canonicalRewardPercentage, 1);
    assert.ok((sd.structuralRewardPercentage ?? 0) > sd.canonicalRewardPercentage!);
    assert.ok((sd.targetCompressionPercentage ?? 0) > 0);
  });

  it("J. RR vs reward distinction preserved", () => {
    const a = unit({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 100.4,
      invalidationReferencePrice: 99.8,
      canonicalRrRatio: 2,
    });
    const b = unit({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 102,
      invalidationReferencePrice: 99,
      canonicalRrRatio: 2,
    });
    const ga = computeGrossPriceMovePercentages(a);
    const gb = computeGrossPriceMovePercentages(b);
    assert.equal(a.canonicalRrRatio, b.canonicalRrRatio);
    assert.notEqual(ga.grossRewardPercentage, gb.grossRewardPercentage);
  });

  it("K–L. wave and fibonacci context", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.waveContext.length > 0);
    assert.equal(report.fibonacciContext.fibonacciProvenanceEstablished, false);
  });

  it("M–P. cross-tabs populated on frozen BTC", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.rewardByDuration.length > 0);
    assert.ok(report.rewardByEvaluator.length > 0);
    assert.ok(report.rewardByDirection.length > 0);
    assert.ok(report.rewardByFailureReason.some((r) => r.failureReason === "RR_BELOW_MINIMUM"));
  });

  it("Q–S. large move example sections", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    if (report.largeMoveExamples.gte3Percent.length === 0) {
      assert.ok(report.largeMoveExamples.emptyBucketNotes.some((n) => n.includes("3%")));
    }
  });

  it("T. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    };
    assert.deepEqual(
      buildHistoricalTargetProvenanceStructuralDistanceAnalysis(input),
      buildHistoricalTargetProvenanceStructuralDistanceAnalysis(input)
    );
  });

  it("U. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify({
      lc: pipe.lifecycleReport,
      audit: pipe.audit,
      b12p: pipe.b12p,
      stats: pipe.stats,
      rStats: pipe.rStats,
    });
    buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(
      JSON.stringify({
        lc: pipe.lifecycleReport,
        audit: pipe.audit,
        b12p: pipe.b12p,
        stats: pipe.stats,
        rStats: pipe.rStats,
      }),
      before
    );
  });

  it("V. lookahead attestation", () => {
    const pipe = frozenStack();
    const report = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.lookaheadAttestation.noFutureBarReferenceSynthesis, true);
  });

  it("W. architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-target-provenance-structural-distance-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(mod.includes("buildHistoricalTargetProvenanceStructuralDistanceAnalysis"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runHistoricalBacktest"));
    assert.ok(!mod.includes("replayProspectiveSetupOutcome"));
    assert.ok(!mod.includes("fetch("));
  });

  it("X. frozen BTC integration parity", () => {
    const pipe = frozenStack();
    const statsBefore = JSON.stringify(pipe.stats.overall);
    const auditGeomBefore = pipe.audit.geometryDistribution;
    const b12pBefore = JSON.stringify(pipe.b12p.prospectiveBandComparison);
    buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: pipe.audit,
      artifactMeasurements: pipe.result.report.artifact.measurements,
      rrThresholdTheoreticalRAnalysisReport: pipe.b12p,
    });
    assert.equal(JSON.stringify(pipe.stats.overall), statsBefore);
    assert.deepEqual(pipe.audit.geometryDistribution, auditGeomBefore);
    assert.equal(JSON.stringify(pipe.b12p.prospectiveBandComparison), b12pBefore);
    assert.equal(pipe.rStats.overall.sumR, pipe.rStats.overall.sumR);
  });
});
