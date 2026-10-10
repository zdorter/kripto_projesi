import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { loadHistoricalFrozenOhlcvDatasetFromFile } from "../historical-frozen-ohlcv-dataset";
import {
  buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis,
  classifyStructuralHeadroomBucket,
  classifyStructuralMoveBucket,
  countB12sStructuralMoveBeyondCanonicalReward,
} from "../historical-structural-extreme-vs-displacement-target-analysis";
import {
  HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION,
} from "../historical-structural-extreme-vs-displacement-target-analysis-types";
import { buildHistoricalTargetProvenanceStructuralDistanceAnalysis } from "../historical-target-provenance-structural-distance-analysis";
import { computeGrossPriceMovePercentages } from "../historical-entry-price-move-quality-analysis";
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
    evaluationBarIndex: patch.evaluationBarIndex ?? 10,
    evaluationBarTime: null,
    prospectiveSetupId: "p1",
    sourceSetupId: null,
    direction: patch.direction,
    entryReferencePrice: patch.entryReferencePrice ?? 100,
    targetReferencePrice: patch.targetReferencePrice ?? 101,
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
  return { result, lifecycleReport };
}

describe("historical-structural-extreme-vs-displacement-target-analysis (B-12u)", () => {
  it("A. schema", () => {
    assert.equal(
      HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION,
      "1.0"
    );
  });

  it("B. population parity on frozen BTC", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.population.independentTrades, pipe.lifecycleReport.trades.length);
    assert.equal(report.population.artifactJoinHits, pipe.lifecycleReport.trades.length);
  });

  it("C. frozen dataset checksum", () => {
    const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(
      "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json"
    );
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
  });

  it("D. prefix-only semantics unchanged on re-run", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    };
    const a = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis(input);
    const b = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis(input);
    assert.deepEqual(a.prefixExtremeAnalysis, b.prefixExtremeAnalysis);
  });

  it("E. bullish headroom", () => {
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 101,
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
                leg: {
                  observedHigh: 104,
                  observedLow: 98,
                  anchorPrice: 95,
                  selectedAnchorSources: ["CONFIRMED_SWING"],
                },
              },
            },
          } as never,
        } as never,
      ],
    });
    const row = report.perTrade[0]!;
    assert.equal(row.prefixExtremeHeadroomPercentage, 3);
    assert.equal(row.prefixStructuralMovePercentage, 4);
    assert.equal(row.prefixHeadroomBucket, "HEADROOM_3_00_TO_5_00");
  });

  it("F. bearish headroom", () => {
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BEARISH",
            entryReferencePrice: 100,
            targetReferencePrice: 99,
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
                leg: {
                  observedHigh: 102,
                  observedLow: 96,
                  anchorPrice: 105,
                  selectedAnchorSources: ["CONFIRMED_SWING"],
                },
              },
            },
          } as never,
        } as never,
      ],
    });
    const row = report.perTrade[0]!;
    assert.equal(row.prefixExtremeHeadroomPercentage, 3);
    assert.equal(row.prefixStructuralMovePercentage, 4);
  });

  it("G. no headroom when extreme inside target", () => {
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 105,
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
                leg: { observedHigh: 103, observedLow: 99, anchorPrice: 95 },
              },
            },
          } as never,
        } as never,
      ],
    });
    assert.equal(report.perTrade[0]!.prefixHeadroomBucket, "NO_HEADROOM");
  });

  it("H. headroom buckets", () => {
    assert.equal(classifyStructuralHeadroomBucket(0), "NO_HEADROOM");
    assert.equal(classifyStructuralHeadroomBucket(0.1), "HEADROOM_LT_0_25");
    assert.equal(classifyStructuralHeadroomBucket(12), "HEADROOM_GTE_10_00");
  });

  it("I. structural move buckets", () => {
    assert.equal(classifyStructuralMoveBucket(0.2), "STRUCTURAL_LT_0_5");
    assert.equal(classifyStructuralMoveBucket(11), "STRUCTURAL_GTE_10");
  });

  it("J. compression", () => {
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 101,
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
                leg: { observedHigh: 103, observedLow: 98, anchorPrice: 99 },
              },
            },
          } as never,
        } as never,
      ],
    });
    const c = report.perTrade[0]!.prefixTargetCompressionPercentage!;
    assert.ok(Math.abs(c - (1 - 1 / 3)) < 1e-6);
  });

  it("K. scenario endpoint separation", () => {
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: {
        schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
        configuration: {} as never,
        summary: {} as never,
        trades: [
          unit({
            direction: "BULLISH",
            entryReferencePrice: 100,
            targetReferencePrice: 101,
          }),
        ],
        entryRejections: [],
      },
      artifactMeasurements: [
        {
          snapshotId: "snap:t1",
          evaluation: {
            historicalSetup: {
              sourceScenario: { endPrice: 110 },
              scenarioRef: { waveLabel: "3" },
            },
            production: {
              openLegResolution: {
                leg: { observedHigh: 102, observedLow: 98, anchorPrice: 95 },
              },
            },
          } as never,
        } as never,
      ],
    });
    const row = report.perTrade[0]!;
    assert.equal(row.prefixStructuralMovePercentage, 2);
    assert.equal(row.scenarioStructuralMovePercentage, 10);
    assert.notEqual(
      row.prefixExtremeHeadroomPercentage,
      row.scenarioEndpointHeadroomPercentage
    );
  });

  it("L–M. evaluator and FAILED + RR_BELOW_MINIMUM on frozen", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.evaluatorCross.some((e) => e.evaluationStatus === "FAILED"));
    assert.ok(
      report.evaluatorFailureCross.some(
        (e) =>
          e.evaluationStatus === "FAILED" &&
          e.firstFailure === "RR_BELOW_MINIMUM" &&
          e.policyClassification === "FAVORABLE_RESOLUTION"
      )
    );
  });

  it("N. outcome cross", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.outcomeCross.length > 0);
  });

  it("O. RR cross", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.rrCross.some((r) => r.rrBucket === "FROM_1_5_TO_2_0"));
  });

  it("P. reward × headroom", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.rewardHeadroomCross.length >= 5);
  });

  it("Q–S. large structural move thresholds", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.largeMoveContext.structuralMoveGte3.trades >= 0);
    assert.ok(report.largeMoveContext.structuralMoveGte5.trades >= 0);
    assert.ok(report.largeMoveContext.structuralMoveGte10.trades >= 0);
  });

  it("T. B-12s 121 parity", () => {
    const pipe = frozenStack();
    const b12u = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    const b12s = buildHistoricalTargetProvenanceStructuralDistanceAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      eligibilityAuditReport: { schemaVersion: "1.0", decisiveRows: [] } as never,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(
      b12u.parity.b12sStructuralMoveBeyondCanonicalRewardCount,
      b12s.canonicalVsStructuralAnalysis.tradesWithMeasurableStructuralAlternative
    );
    assert.equal(b12u.parity.b12sStructuralMoveBeyondCanonicalRewardCount, 121);
  });

  it("U. determinism", () => {
    const pipe = frozenStack();
    const input = {
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    };
    assert.deepEqual(
      buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis(input),
      buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis(input)
    );
  });

  it("V. immutability", () => {
    const pipe = frozenStack();
    const before = JSON.stringify(pipe.lifecycleReport);
    buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(JSON.stringify(pipe.lifecycleReport), before);
  });

  it("W. sample size on slices", () => {
    const pipe = frozenStack();
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.ok(report.waveContext[0]!.sampleSizeQuality);
    assert.ok(typeof report.waveContext[0]!.interpretWithCaution === "boolean");
  });

  it("X. architecture guard", () => {
    const mod = readFileSync(
      join(
        process.cwd(),
        "src/wave/historical-structural-extreme-vs-displacement-target-analysis.ts"
      ),
      "utf8"
    );
    assert.ok(
      mod.includes("buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis")
    );
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("buildIndependentTradeLifecycleReport"));
    assert.ok(!mod.includes("fetch("));
  });

  it("countB12s helper matches per-trade loop", () => {
    const pipe = frozenStack();
    let manual = 0;
    const bySnap = new Map(
      pipe.result.report.artifact.measurements.map((m) => [m.snapshotId, m])
    );
    for (const t of pipe.lifecycleReport.trades) {
      const ev = bySnap.get(t.snapshotId)?.evaluation ?? null;
      const { grossRewardPercentage } = computeGrossPriceMovePercentages(t);
      if (countB12sStructuralMoveBeyondCanonicalReward(t, ev, grossRewardPercentage)) {
        manual += 1;
      }
    }
    const report = buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport: pipe.lifecycleReport,
      artifactMeasurements: pipe.result.report.artifact.measurements,
    });
    assert.equal(report.parity.b12sStructuralMoveBeyondCanonicalRewardCount, manual);
  });
});
