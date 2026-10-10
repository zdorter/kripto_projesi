import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
} from "../setup/historical-measurement-contract";
import type {
  HistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactEntry,
} from "../setup/historical-measurement-artifact-types";
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import {
  aggregateHistoricalMeasurementStatistics,
  emptyHistoricalMeasurementStatisticsReport,
  isPathMeasuredOutcome,
} from "../historical-measurement-statistics";
import { HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION } from "../historical-measurement-statistics-types";

function minimalTradeEvaluation(status: TradeEvaluationStatus) {
  return {
    schemaVersion: "1.0" as const,
    status,
    passed: status === "PASSED",
    checks: {
      entry: "VALID" as const,
      stop: "VALID" as const,
      target: "VALID" as const,
      rr: "VALID" as const,
      setupValidity: "VALID" as const,
    },
    firstFailure: null,
    diagnostics: {
      entryReferencePrice: 100,
      liveMarketPrice: 100,
      entryDeviationRatio: 0,
      entryDeviationPercent: 0,
      risk: 1,
      reward: 2,
      rrRatio: 2,
      minimumRr: 1.5,
      entryFreshnessTolerance: 0.01,
      direction: "BULLISH" as const,
      structuralInvalidationReferencePrice: 99,
    },
    evaluationBarIndex: 10,
    evaluationPrice: 100,
    futureSafe: true,
  };
}

function outcomeAttachment(status: ProspectiveSetupOutcomeReplayStatus) {
  return {
    futureBarsAvailable: status === "NO_FUTURE_DATA" ? 0 : 5,
    replay: {
      schemaVersion: "1.0" as const,
      outcome: status,
      evaluationBarIndex: 10,
      resolutionBarIndex: 11,
      barsAfterEvaluation: 1,
      targetPrice: 110,
      invalidationPrice: 90,
      direction: "BULLISH" as const,
      horizonBars: 24,
      targetTouched: status === "TARGET_TOUCHED" || status === "AMBIGUOUS",
      invalidationTouched:
        status === "INVALIDATION_TOUCHED" || status === "AMBIGUOUS",
      prospectiveSetupId: "p1",
    },
  };
}

function entry(
  patch: Partial<HistoricalMeasurementArtifactEntry> &
    Pick<HistoricalMeasurementArtifactEntry, "prospectiveSetupId">
): HistoricalMeasurementArtifactEntry {
  const prospectiveSetupId = patch.prospectiveSetupId;
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    snapshotId: patch.snapshotId ?? `BTCUSDT:1H:10:${prospectiveSetupId}`,
    symbol: patch.symbol ?? "BTCUSDT",
    timeframe: patch.timeframe ?? "1H",
    evaluationBarIndex: patch.evaluationBarIndex ?? 10,
    evaluationBarTime: patch.evaluationBarTime ?? 1,
    prospectiveSetupId,
    horizonBars: patch.horizonBars ?? 24,
    cohorts: patch.cohorts ?? ["ALL_PRODUCTION_CANDIDATES"],
    cohort: patch.cohort ?? "ALL_PRODUCTION_CANDIDATES",
    evaluation: patch.evaluation ?? {
      historicalSetup: null,
      production: {
        schemaVersion: "1.0",
        id: prospectiveSetupId,
        symbol: "BTCUSDT",
        timeframe: "1H",
        familyId: "STRUCTURAL_RESUMPTION_CONTEXT",
        semanticCategory: "PROSPECTIVE_TRADE_SETUP",
        sourceKind: "HISTORICAL_TRADE_SETUP",
        sourceSetupId: patch.evaluation?.production?.sourceSetupId ?? "src-1",
        sourceSetupTypeId: "type-1",
        status: "CONFIRMED",
        evaluationBarIndex: 10,
        prospectiveWaveLabel: null,
        observedDirection: "BULLISH",
        openLegResolution: "RESOLVED",
        contract: {} as never,
        objectiveEligibility: {} as never,
        targetGateOutcome: {} as never,
        funnelFirstFailure: "COMPLETE",
        funnelReasonCode: null,
        futureSafe: true,
        usesLegacyPotentialAsProductionEvidence: false,
      },
      references: {} as never,
      tradeEvaluation: minimalTradeEvaluation("PASSED"),
    },
    outcome: patch.outcome === undefined ? outcomeAttachment("NO_TOUCH") : patch.outcome,
  };
}

function artifact(measurements: HistoricalMeasurementArtifactEntry[]): HistoricalMeasurementArtifact {
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    dataset: {
      symbol: "BTCUSDT",
      timeframe: "1H",
      candleCount: 100,
      startEvaluationBar: 0,
      endEvaluationBar: 10,
      horizonBars: 24,
      rangeError: null,
    },
    measurements,
  };
}

describe("historical measurement statistics (B-9a)", () => {
  it("A: empty artifact", () => {
    const report = aggregateHistoricalMeasurementStatistics(artifact([]));
    assert.equal(report.sample.totalSnapshots, 0);
    assert.equal(report.sample.uniqueProspectiveSetupIds, 0);
    assert.equal(report.sample.uniqueSourceSetupIds, 0);
    assert.equal(report.distributions.outcome.nullOutcome, 0);
    assert.equal(report.dataQuality.pathMeasured, 0);
    assert.equal(report.dataQuality.pathUnmeasured, 0);
    assert.deepEqual(
      report,
      emptyHistoricalMeasurementStatisticsReport()
    );
  });

  it("B: single measurement", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([entry({ prospectiveSetupId: "p1" })])
    );
    assert.equal(report.sample.totalSnapshots, 1);
    assert.equal(report.sample.uniqueProspectiveSetupIds, 1);
    assert.equal(report.distributions.outcome.NO_TOUCH, 1);
    assert.equal(report.distributions.tradeEvaluation.PASSED, 1);
  });

  it("C + P: multiple outcomes all six B-6 values", () => {
    const statuses: ProspectiveSetupOutcomeReplayStatus[] = [
      "NO_FUTURE_DATA",
      "NO_TOUCH",
      "TARGET_TOUCHED",
      "INVALIDATION_TOUCHED",
      "AMBIGUOUS",
      "INSUFFICIENT_CONTEXT",
    ];
    const measurements = statuses.map((s, i) =>
      entry({
        prospectiveSetupId: `p-${i}`,
        snapshotId: `BTCUSDT:1H:${i}:p-${i}`,
        evaluationBarIndex: i,
        outcome: outcomeAttachment(s),
      })
    );
    const report = aggregateHistoricalMeasurementStatistics(artifact(measurements));
    assert.equal(report.sample.totalSnapshots, 6);
    for (const s of statuses) {
      assert.equal(report.distributions.outcome[s], 1);
    }
  });

  it("D: null outcome", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([entry({ prospectiveSetupId: "p1", outcome: null })])
    );
    assert.equal(report.distributions.outcome.nullOutcome, 1);
    assert.equal(report.dataQuality.pathUnmeasured, 1);
    assert.equal(report.dataQuality.pathMeasured, 0);
  });

  it("E: NO_FUTURE_DATA unmeasured", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "p1",
          outcome: outcomeAttachment("NO_FUTURE_DATA"),
        }),
      ])
    );
    assert.equal(report.distributions.outcome.NO_FUTURE_DATA, 1);
    assert.equal(report.dataQuality.pathUnmeasured, 1);
  });

  it("F: AMBIGUOUS measured", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "p1",
          outcome: outcomeAttachment("AMBIGUOUS"),
        }),
      ])
    );
    assert.equal(report.distributions.outcome.AMBIGUOUS, 1);
    assert.equal(report.dataQuality.pathMeasured, 1);
    assert.ok(isPathMeasuredOutcome("AMBIGUOUS"));
  });

  it("G + Q: trade evaluation distribution all statuses", () => {
    const measurements = (
      ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"] as TradeEvaluationStatus[]
    ).map((status, i) =>
      entry({
        prospectiveSetupId: `p-te-${i}`,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation(status),
        },
      })
    );
    const report = aggregateHistoricalMeasurementStatistics(artifact(measurements));
    assert.equal(report.distributions.tradeEvaluation.PASSED, 1);
    assert.equal(report.distributions.tradeEvaluation.FAILED, 1);
    assert.equal(report.distributions.tradeEvaluation.INSUFFICIENT_CONTEXT, 1);
  });

  it("H: pathMeasured vs pathUnmeasured", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({ prospectiveSetupId: "a", outcome: outcomeAttachment("NO_TOUCH") }),
        entry({ prospectiveSetupId: "b", outcome: outcomeAttachment("TARGET_TOUCHED") }),
        entry({ prospectiveSetupId: "c", outcome: null }),
        entry({
          prospectiveSetupId: "d",
          outcome: outcomeAttachment("INSUFFICIENT_CONTEXT"),
        }),
      ])
    );
    assert.equal(report.dataQuality.pathMeasured, 2);
    assert.equal(report.dataQuality.pathUnmeasured, 2);
  });

  it("I: FAILED + TARGET_TOUCHED independence", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "p1",
          outcome: outcomeAttachment("TARGET_TOUCHED"),
          evaluation: {
            historicalSetup: null,
            production: null,
            references: {} as never,
            tradeEvaluation: minimalTradeEvaluation("FAILED"),
          },
        }),
      ])
    );
    assert.equal(report.distributions.tradeEvaluation.FAILED, 1);
    assert.equal(report.distributions.tradeEvaluation.PASSED, 0);
    assert.equal(report.distributions.outcome.TARGET_TOUCHED, 1);
    assert.equal(report.distributions.outcome.INVALIDATION_TOUCHED, 0);
  });

  it("J: PASSED + INVALIDATION_TOUCHED independence", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "p1",
          outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
          evaluation: {
            historicalSetup: null,
            production: null,
            references: {} as never,
            tradeEvaluation: minimalTradeEvaluation("PASSED"),
          },
        }),
      ])
    );
    assert.equal(report.distributions.tradeEvaluation.PASSED, 1);
    assert.equal(report.distributions.outcome.INVALIDATION_TOUCHED, 1);
  });

  it("K + S: same prospectiveSetupId at different E", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "same-p",
          snapshotId: "BTCUSDT:1H:100:same-p",
          evaluationBarIndex: 100,
        }),
        entry({
          prospectiveSetupId: "same-p",
          snapshotId: "BTCUSDT:1H:101:same-p",
          evaluationBarIndex: 101,
        }),
        entry({
          prospectiveSetupId: "same-p",
          snapshotId: "BTCUSDT:1H:102:same-p",
          evaluationBarIndex: 102,
        }),
      ])
    );
    assert.equal(report.sample.totalSnapshots, 3);
    assert.equal(report.sample.uniqueProspectiveSetupIds, 1);
  });

  it("L + T: unique source setup ids", () => {
    const base = entry({ prospectiveSetupId: "p1" });
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        base,
        entry({
          prospectiveSetupId: "p2",
          evaluation: {
            ...base.evaluation,
            production: base.evaluation.production
              ? { ...base.evaluation.production, sourceSetupId: "src-1" }
              : null,
          },
        }),
        entry({
          prospectiveSetupId: "p3",
          evaluation: {
            ...base.evaluation,
            production: base.evaluation.production
              ? { ...base.evaluation.production, sourceSetupId: "src-2" }
              : null,
          },
        }),
      ])
    );
    assert.equal(report.sample.uniqueSourceSetupIds, 2);
  });

  it("M: deterministic double aggregation", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "p1" }),
      entry({ prospectiveSetupId: "p2" }),
    ]);
    const a = aggregateHistoricalMeasurementStatistics(art);
    const b = aggregateHistoricalMeasurementStatistics(art);
    assert.deepEqual(a, b);
  });

  it("N: input immutability", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const before = JSON.stringify(art);
    aggregateHistoricalMeasurementStatistics(art);
    assert.equal(JSON.stringify(art), before);
  });

  it("R: mixed outcome/evaluation combinations", () => {
    const report = aggregateHistoricalMeasurementStatistics(
      artifact([
        entry({
          prospectiveSetupId: "a",
          outcome: outcomeAttachment("TARGET_TOUCHED"),
          evaluation: {
            historicalSetup: null,
            production: null,
            references: {} as never,
            tradeEvaluation: minimalTradeEvaluation("FAILED"),
          },
        }),
        entry({
          prospectiveSetupId: "b",
          outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
          evaluation: {
            historicalSetup: null,
            production: null,
            references: {} as never,
            tradeEvaluation: minimalTradeEvaluation("PASSED"),
          },
        }),
      ])
    );
    assert.equal(report.distributions.outcome.TARGET_TOUCHED, 1);
    assert.equal(report.distributions.outcome.INVALIDATION_TOUCHED, 1);
    assert.equal(report.distributions.tradeEvaluation.FAILED, 1);
    assert.equal(report.distributions.tradeEvaluation.PASSED, 1);
  });

  it("O: module has no forbidden dependencies", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-measurement-statistics.ts"),
      "utf8"
    );
    assert.ok(text.includes("aggregateHistoricalMeasurementStatistics"));
    assert.ok(!text.includes("runProductionWaveScanner"));
    assert.ok(!text.includes("buildHistoricalMeasurementArtifact"));
    assert.ok(!text.includes("replayProspectiveSetupOutcome"));
    assert.ok(!text.includes("evaluateTradeEvaluation"));
    assert.ok(!text.includes("Date.now"));
    assert.ok(!text.includes("Math.random"));
    assert.ok(!text.includes("fetch("));
  });

  it("statistics schema version", () => {
    const report = aggregateHistoricalMeasurementStatistics(artifact([]));
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION
    );
    assert.equal(report.input.measurementSchemaVersion, "1.0");
  });
});
