import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
} from "../setup/historical-measurement-contract";
import type {
  HistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactEntry,
} from "../setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementCohort } from "../setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import {
  aggregateHistoricalPositionOutcomeStatistics,
  computeHistoricalPositionOutcomeWinRateDecisive,
  emptyHistoricalPositionOutcomeStatisticsCounts,
  pairHistoricalPositionOutcomeObservationsWithBatch,
} from "../historical-position-outcome-statistics";
import { HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION } from "../historical-position-outcome-statistics-types";
import {
  isHistoricalPositionPolicyDecisiveClassification,
} from "../historical-position-outcome-policy-contract";
import { classifyHistoricalPositionOutcomePolicy } from "../historical-position-outcome-policy";
import { selectHistoricalMeasurementEntries } from "../historical-measurement-statistics-filter";
import { HISTORICAL_POSITION_PATH_SCHEMA_VERSION } from "../historical-position-path-contract";
import { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "../historical-position-path-contract";
import type { HistoricalPositionPathResult } from "../historical-position-path-types";
import type { HistoricalPositionPathBatchResult } from "../historical-position-path-batch-types";
import { HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION } from "../historical-position-path-batch-types";

function pathResult(
  outcome: ProspectiveSetupOutcomeReplayStatus
): HistoricalPositionPathResult {
  return {
    schemaVersion: HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    snapshotId: "snap:1",
    outcome,
    b6ReplayOutcome: outcome,
    evaluationBarIndex: 10,
    horizonBars: 24,
    futureBarsAvailable: 10,
    resolutionBarIndex: 11,
    barsAfterEvaluation: 1,
    targetTouched: outcome === "TARGET_TOUCHED" || outcome === "AMBIGUOUS",
    invalidationTouched:
      outcome === "INVALIDATION_TOUCHED" || outcome === "AMBIGUOUS",
    direction: "BULLISH",
    entryReferencePrice: 100,
    targetReferencePrice: 110,
    invalidationReferencePrice: 95,
    limitations: [],
  };
}

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
      rrRatio: 1.2,
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

function artifactEntry(
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
    evaluationBarTime: 1,
    prospectiveSetupId,
    horizonBars: 24,
    cohorts: patch.cohorts ?? ["ALL_PRODUCTION_CANDIDATES"],
    cohort: patch.cohort ?? "ALL_PRODUCTION_CANDIDATES",
    evaluation: patch.evaluation ?? {
      historicalSetup: null,
      production: {
        observedDirection: "BULLISH",
        familyId: "STRUCTURAL_RESUMPTION_CONTEXT",
        sourceSetupId: "src-1",
      } as never,
      references: {
        schemaVersion: "1.0",
        prospectiveId: prospectiveSetupId,
        entry: { outcome: "VALID", referencePrice: 100, modelId: "m" },
        stop: { outcome: "VALID", referencePrice: 95, modelId: "m" },
        target: { outcome: "VALID", referencePrice: 110, modelId: "m" },
        rr: { outcome: "VALID", ratio: 1.2 },
        readyForFurtherEvaluation: true,
        limitations: [],
      },
      tradeEvaluation: minimalTradeEvaluation("PASSED"),
    },
    outcome: null,
  };
}

function observation(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  entryPatch: Partial<HistoricalMeasurementArtifactEntry> &
    Pick<HistoricalMeasurementArtifactEntry, "prospectiveSetupId">
) {
  return {
    entry: artifactEntry(entryPatch),
    pathResult: pathResult(outcome),
  };
}

function aggregate(
  observations: ReturnType<typeof observation>[],
  filter?: { cohorts?: readonly HistoricalMeasurementCohort[] }
) {
  return aggregateHistoricalPositionOutcomeStatistics({
    totalArtifactSnapshots: observations.length,
    observations,
    filter,
  });
}

describe("historical position outcome statistics (B-10e)", () => {
  it("A–F: classification counts from path outcomes", () => {
    const report = aggregate([
      observation("TARGET_TOUCHED", { prospectiveSetupId: "w1" }),
      observation("INVALIDATION_TOUCHED", { prospectiveSetupId: "l1" }),
      observation("AMBIGUOUS", { prospectiveSetupId: "a1" }),
      observation("NO_TOUCH", { prospectiveSetupId: "n1" }),
      observation("NO_FUTURE_DATA", { prospectiveSetupId: "f1" }),
      observation("INSUFFICIENT_CONTEXT", { prospectiveSetupId: "i1" }),
    ]);
    const c = report.overall.counts;
    assert.equal(c.favorableResolutions, 1);
    assert.equal(c.wins, 1);
    assert.equal(c.adverseResolutions, 1);
    assert.equal(c.losses, 1);
    assert.equal(c.inconclusiveSameBar, 1);
    assert.equal(c.unresolvedAtHorizon, 1);
    assert.equal(c.unmeasuredNoFuture, 1);
    assert.equal(c.unmeasuredInsufficient, 1);
  });

  it("G–I: decisive totals and winRate_decisive", () => {
    const report = aggregate([
      observation("TARGET_TOUCHED", { prospectiveSetupId: "w1" }),
      observation("TARGET_TOUCHED", { prospectiveSetupId: "w2" }),
      observation("INVALIDATION_TOUCHED", { prospectiveSetupId: "l1" }),
    ]);
    const c = report.overall.counts;
    assert.equal(c.decisiveResolutions, 3);
    assert.equal(c.wins + c.losses, c.decisiveResolutions);
    const rate = report.overall.rates.winRate_decisive;
    assert.equal(rate.denominatorId, "DECISIVE_RESOLUTIONS");
    assert.equal(rate.numerator, 2);
    assert.equal(rate.denominator, 3);
    assert.equal(rate.value, 2 / 3);

    const zero = computeHistoricalPositionOutcomeWinRateDecisive(0, 0);
    assert.equal(zero.value, null);
    assert.equal(zero.denominator, 0);
  });

  it("J–L: cohort filter OR and overlap", () => {
    const observations = [
      {
        entry: artifactEntry({
          prospectiveSetupId: "overlap",
          cohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
        }),
        pathResult: pathResult("TARGET_TOUCHED"),
      },
      {
        entry: artifactEntry({
          prospectiveSetupId: "display-only",
          cohorts: ["DISPLAY_PICK"],
        }),
        pathResult: pathResult("INVALIDATION_TOUCHED"),
      },
    ];
    const orFilter = aggregate(observations, {
      cohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
    });
    assert.equal(orFilter.overall.counts.totalSnapshots, 2);

    const displayOnly = aggregate(observations, { cohorts: ["DISPLAY_PICK"] });
    assert.equal(displayOnly.overall.counts.totalSnapshots, 2);

    assert.equal(
      orFilter.cohorts.ALL_PRODUCTION_CANDIDATES.counts.totalSnapshots,
      1
    );
    assert.equal(
      orFilter.cohorts.DISPLAY_PICK.counts.totalSnapshots,
      2
    );
    assert.notEqual(
      orFilter.cohorts.ALL_PRODUCTION_CANDIDATES.counts.totalSnapshots,
      orFilter.overall.counts.totalSnapshots
    );
  });

  it("M–P: per-cohort slices exist", () => {
    const report = aggregate([
      observation("TARGET_TOUCHED", {
        prospectiveSetupId: "p1",
        cohorts: ["TRADE_EVAL_PASSED"],
      }),
    ]);
    for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
      assert.ok(report.cohorts[cohort]);
    }
    assert.equal(
      report.cohorts.TRADE_EVAL_PASSED.counts.favorableResolutions,
      1
    );
  });

  it("Q–T: symbol, timeframe, setup family, direction slices", () => {
    const report = aggregate([
      {
        entry: artifactEntry({
          prospectiveSetupId: "eth",
          symbol: "ETHUSDT",
          timeframe: "4H",
          evaluation: {
            ...artifactEntry({ prospectiveSetupId: "eth" }).evaluation,
            production: {
              observedDirection: "BEARISH",
              familyId: "FAMILY_A",
              sourceSetupId: "s",
            } as never,
          },
        }),
        pathResult: pathResult("TARGET_TOUCHED"),
      },
    ]);
    assert.equal(report.bySymbol.ETHUSDT?.counts.wins, 1);
    assert.equal(report.byTimeframe["4H"]?.counts.wins, 1);
    assert.equal(report.bySetupFamily.FAMILY_A?.counts.wins, 1);
    assert.equal(report.byDirection.BEARISH.counts.wins, 1);
  });

  it("U–V: RR bucket slice includes LT_1.5 without exclusion", () => {
    const report = aggregate([
      {
        entry: artifactEntry({
          prospectiveSetupId: "low-rr",
          evaluation: {
            ...artifactEntry({ prospectiveSetupId: "low-rr" }).evaluation,
            references: {
              ...artifactEntry({ prospectiveSetupId: "low-rr" }).evaluation
                .references,
              rr: { outcome: "VALID", ratio: 1.2 },
            },
          },
        }),
        pathResult: pathResult("TARGET_TOUCHED"),
      },
    ]);
    assert.equal(report.byRrBucket.FROM_1_0_TO_1_5.counts.wins, 1);
  });

  it("W–X: trade evaluation independent of policy outcome", () => {
    const report = aggregate([
      {
        entry: artifactEntry({
          prospectiveSetupId: "failed-win",
          evaluation: {
            ...artifactEntry({ prospectiveSetupId: "failed-win" }).evaluation,
            tradeEvaluation: minimalTradeEvaluation("FAILED"),
          },
        }),
        pathResult: pathResult("TARGET_TOUCHED"),
      },
      {
        entry: artifactEntry({
          prospectiveSetupId: "passed-loss",
          evaluation: {
            ...artifactEntry({ prospectiveSetupId: "passed-loss" }).evaluation,
            tradeEvaluation: minimalTradeEvaluation("PASSED"),
          },
        }),
        pathResult: pathResult("INVALIDATION_TOUCHED"),
      },
    ]);
    assert.equal(
      report.evaluationCross.FAILED.FAVORABLE_RESOLUTION,
      1
    );
    assert.equal(
      report.evaluationCross.PASSED.ADVERSE_RESOLUTION,
      1
    );
  });

  it("Y–AA: non-decisive and unmeasured never decisive", () => {
    const report = aggregate([
      observation("AMBIGUOUS", { prospectiveSetupId: "a" }),
      observation("NO_TOUCH", { prospectiveSetupId: "n" }),
      observation("NO_FUTURE_DATA", { prospectiveSetupId: "f" }),
    ]);
    for (const [cls, count] of Object.entries(
      report.overall.classification
    )) {
      if (count > 0) {
        assert.equal(
          isHistoricalPositionPolicyDecisiveClassification(
            cls as never
          ),
          cls === "FAVORABLE_RESOLUTION" || cls === "ADVERSE_RESOLUTION"
        );
      }
    }
    assert.equal(report.overall.counts.losses, 0);
  });

  it("AB: denominator invariants", () => {
    const report = aggregate([
      observation("TARGET_TOUCHED", { prospectiveSetupId: "w" }),
      observation("NO_TOUCH", { prospectiveSetupId: "n" }),
      observation("NO_FUTURE_DATA", { prospectiveSetupId: "f" }),
    ]);
    const c = report.overall.counts;
    const d = report.overall.denominators;
    assert.equal(c.totalSnapshots, d.filteredSnapshots);
    assert.equal(c.measuredPaths + c.unmeasuredPaths, c.totalSnapshots);
    assert.equal(
      c.decisiveResolutions + c.measuredNonDecisive,
      c.measuredPaths
    );
    assert.equal(
      c.favorableResolutions + c.adverseResolutions,
      c.decisiveResolutions
    );
  });

  it("AC–AD: determinism and input immutability", () => {
    const observations = [
      observation("TARGET_TOUCHED", { prospectiveSetupId: "w" }),
    ];
    const frozen = JSON.stringify(observations);
    const a = aggregate(observations);
    const b = aggregate(observations);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(observations), frozen);
  });

  it("AE: uses B-10d mapper classification", () => {
    const pr = pathResult("INVALIDATION_TOUCHED");
    const expected = classifyHistoricalPositionOutcomePolicy(pr).classification;
    const report = aggregate([
      { entry: artifactEntry({ prospectiveSetupId: "l" }), pathResult: pr },
    ]);
    assert.equal(
      report.overall.classification.ADVERSE_RESOLUTION,
      1
    );
    assert.equal(expected, "ADVERSE_RESOLUTION");
  });

  it("AF: statistics module does not rerun path/replay", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/historical-position-outcome-statistics.ts"),
      "utf8"
    );
    assert.ok(!src.includes("replayProspectiveSetupOutcome"));
    assert.ok(!src.includes("resolveHistoricalPositionPathV1"));
    assert.ok(!src.includes("runHistoricalPositionPathBatch"));
    assert.ok(!src.includes("composeProductionWaveScannerForSymbol"));
    assert.ok(!src.includes("evaluateTradeEvaluation"));
  });

  it("AL: schema version", () => {
    const report = aggregate([]);
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION
    );
    assert.equal(report.statisticsSchemaVersion, "1.0");
  });

  it("pairHistoricalPositionOutcomeObservationsWithBatch aligns entries", () => {
    const e1 = artifactEntry({
      prospectiveSetupId: "p1",
      snapshotId: "BTCUSDT:1H:1:p1",
    });
    const e2 = artifactEntry({
      prospectiveSetupId: "p2",
      snapshotId: "BTCUSDT:1H:2:p2",
    });
    const art: HistoricalMeasurementArtifact = {
      schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
      dataset: {
        symbol: "BTCUSDT",
        timeframe: "1H",
        candleCount: 10,
        startEvaluationBar: 0,
        endEvaluationBar: 2,
        horizonBars: 24,
        rangeError: null,
      },
      measurements: [e2, e1],
    };
    const batch: HistoricalPositionPathBatchResult = {
      batchSchemaVersion: HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION,
      positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
      filter: {},
      input: {
        measurementSchemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
        totalSnapshots: 2,
        filteredSnapshotCount: 2,
        candleCount: 10,
        datasetSymbol: "BTCUSDT",
        datasetTimeframe: "1H",
        artifactDatasetCandleCount: 10,
        horizonBarsOverride: null,
      },
      results: [pathResult("TARGET_TOUCHED"), pathResult("NO_TOUCH")],
    };
    const selected = selectHistoricalMeasurementEntries(art, {});
    assert.equal(selected.length, 2);
    const paired = pairHistoricalPositionOutcomeObservationsWithBatch(art, batch);
    assert.equal(paired.length, 2);
    assert.equal(paired[0]!.entry.snapshotId, "BTCUSDT:1H:1:p1");
  });

  it("empty counts helper", () => {
    const empty = emptyHistoricalPositionOutcomeStatisticsCounts();
    assert.equal(empty.totalSnapshots, 0);
    assert.equal(empty.wins, 0);
  });
});
