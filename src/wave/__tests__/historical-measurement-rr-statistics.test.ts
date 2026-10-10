import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
} from "../setup/historical-measurement-contract";
import type {
  HistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactEntry,
} from "../setup/historical-measurement-artifact-types";
import type { ProspectiveReferenceEvaluation } from "../setup/prospective-reference-evaluation";
import { TRADE_EVALUATION_MIN_RR } from "../setup/trade-evaluation-contract";
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import { aggregateHistoricalMeasurementStatisticsFiltered } from "../historical-measurement-statistics-filter";
import { HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME } from "../historical-measurement-cross-statistics-types";
import {
  aggregateHistoricalMeasurementRRStatistics,
  classifyHistoricalMeasurementRrBucketRow,
  resolveHistoricalMeasurementCanonicalRrRatio,
} from "../historical-measurement-rr-statistics";
import {
  HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS,
  HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID,
  HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS,
  HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION,
  type HistoricalMeasurementRRBucketCounts,
} from "../historical-measurement-rr-statistics-types";

function referencesWithRr(
  ratio: number | null
): ProspectiveReferenceEvaluation {
  return {
    schemaVersion: "1.0",
    prospectiveId: "p1",
    entry: {
      outcome: "AVAILABLE",
      referencePrice: 100,
      modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
    },
    stop: {
      outcome: "AVAILABLE",
      referencePrice: 90,
      modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
    },
    target: {
      outcome: "AVAILABLE",
      referencePrice: 110,
      modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
      policyId: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
    },
    rr: {
      outcome: ratio === null ? "INSUFFICIENT_CONTEXT" : "AVAILABLE",
      ratio,
    },
    readyForFurtherEvaluation: true,
    limitations: [],
  };
}

function minimalTradeEvaluation(
  status: TradeEvaluationStatus,
  rrRatio = 2
) {
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
      rrRatio,
      minimumRr: TRADE_EVALUATION_MIN_RR,
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
    Pick<HistoricalMeasurementArtifactEntry, "prospectiveSetupId"> & {
      rrRatio?: number | null;
    }
): HistoricalMeasurementArtifactEntry {
  const prospectiveSetupId = patch.prospectiveSetupId;
  const rrRatio =
    patch.rrRatio === undefined ? 2 : patch.rrRatio;
  const baseEval = patch.evaluation;
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
    evaluation: baseEval ?? {
      historicalSetup: null,
      production: null,
      references: referencesWithRr(rrRatio),
      tradeEvaluation: minimalTradeEvaluation("PASSED", rrRatio ?? 2),
    },
    outcome:
      patch.outcome === undefined
        ? outcomeAttachment("NO_TOUCH")
        : patch.outcome,
  };
}

function artifact(
  measurements: HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementArtifact {
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

function sumBucketCounts(counts: HistoricalMeasurementRRBucketCounts): number {
  let total = 0;
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    total += counts[row];
  }
  return total;
}

describe("historical measurement RR statistics (B-9d)", () => {
  it("A: empty artifact", () => {
    const report = aggregateHistoricalMeasurementRRStatistics(artifact([]), {});
    assert.equal(report.rr.grandTotal, 0);
    assert.equal(sumBucketCounts(report.rr.bucketCounts), 0);
  });

  it("B–J: bucket boundaries", () => {
    assert.equal(classifyHistoricalMeasurementRrBucketRow(0.43), "LT_1_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(1.0), "FROM_1_0_TO_1_5");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(1.49), "FROM_1_0_TO_1_5");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(1.5), "FROM_1_5_TO_2_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(1.99), "FROM_1_5_TO_2_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(2.0), "FROM_2_0_TO_3_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(2.99), "FROM_2_0_TO_3_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(3.0), "GTE_3_0");
    assert.equal(classifyHistoricalMeasurementRrBucketRow(4.5), "GTE_3_0");
    assert.equal(TRADE_EVALUATION_MIN_RR, 1.5);
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(TRADE_EVALUATION_MIN_RR),
      "FROM_1_5_TO_2_0"
    );
  });

  it("K–L: null and invalid RR → NULL_OR_INVALID_RR", () => {
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(null),
      HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID
    );
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(Number.NaN),
      HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID
    );
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(Number.POSITIVE_INFINITY),
      HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID
    );
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(-0.5),
      HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID
    );
    const art = artifact([
      entry({ prospectiveSetupId: "null-rr", rrRatio: null }),
      entry({
        prospectiveSetupId: "nan-rr",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(Number.NaN),
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { rr } = aggregateHistoricalMeasurementRRStatistics(art, {});
    assert.equal(rr.bucketCounts.NULL_OR_INVALID_RR, 2);
    assert.equal(rr.rrByEvaluation.NULL_OR_INVALID_RR.FAILED, 1);
  });

  it("M: all numerical buckets in one population", () => {
    const ratios = [0.5, 1.2, 1.6, 2.5, 3.5];
    const measurements = ratios.map((r, i) =>
      entry({ prospectiveSetupId: `r${i}`, rrRatio: r })
    );
    const { bucketCounts } = aggregateHistoricalMeasurementRRStatistics(
      artifact(measurements),
      {}
    ).rr;
    assert.equal(bucketCounts.LT_1_0, 1);
    assert.equal(bucketCounts.FROM_1_0_TO_1_5, 1);
    assert.equal(bucketCounts.FROM_1_5_TO_2_0, 1);
    assert.equal(bucketCounts.FROM_2_0_TO_3_0, 1);
    assert.equal(bucketCounts.GTE_3_0, 1);
  });

  it("N: bucket grand total parity with filteredSnapshots", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", rrRatio: 0.9 }),
      entry({ prospectiveSetupId: "b", rrRatio: null }),
    ]);
    const report = aggregateHistoricalMeasurementRRStatistics(art, {});
    const filtered = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.equal(sumBucketCounts(report.rr.bucketCounts), report.rr.grandTotal);
    assert.equal(report.rr.grandTotal, filtered.denominators.filteredSnapshots);
  });

  it("O + B-9b parity: evaluation column totals", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p",
        rrRatio: 2,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(2),
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
      entry({
        prospectiveSetupId: "f",
        rrRatio: 1.2,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(1.2),
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const rr = aggregateHistoricalMeasurementRRStatistics(art, {}).rr;
    const core = aggregateHistoricalMeasurementStatisticsFiltered(art, {}).core;
    assert.equal(
      rr.evaluationColumnTotals.PASSED,
      core.distributions.tradeEvaluation.PASSED
    );
    assert.equal(
      rr.evaluationColumnTotals.FAILED,
      core.distributions.tradeEvaluation.FAILED
    );
  });

  it("P: RR × Evaluation cell", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "x",
        rrRatio: 1.4,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(1.4),
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { rrByEvaluation } = aggregateHistoricalMeasurementRRStatistics(art, {})
      .rr;
    assert.equal(rrByEvaluation.FROM_1_0_TO_1_5.FAILED, 1);
  });

  it("Q + R–X: RR × Outcome columns", () => {
    const outcomes: ProspectiveSetupOutcomeReplayStatus[] = [
      "TARGET_TOUCHED",
      "INVALIDATION_TOUCHED",
      "AMBIGUOUS",
      "NO_TOUCH",
      "NO_FUTURE_DATA",
      "INSUFFICIENT_CONTEXT",
    ];
    const measurements = outcomes.map((o, i) =>
      entry({
        prospectiveSetupId: `o${i}`,
        rrRatio: 2,
        outcome: outcomeAttachment(o),
      })
    );
    measurements.push(
      entry({ prospectiveSetupId: "null-out", rrRatio: 2, outcome: null })
    );
    const rr = aggregateHistoricalMeasurementRRStatistics(
      artifact(measurements),
      {}
    ).rr;
    for (const o of outcomes) {
      assert.equal(rr.rrByOutcome.FROM_2_0_TO_3_0[o], 1);
      assert.equal(rr.outcomeColumnTotals[o], 1);
    }
    assert.equal(
      rr.rrByOutcome.FROM_2_0_TO_3_0[HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME],
      1
    );
    assert.equal(
      rr.outcomeColumnTotals[HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME],
      1
    );
  });

  it("Y: FAILED + TARGET_TOUCHED", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "y",
        rrRatio: 0.43,
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(0.43),
          tradeEvaluation: minimalTradeEvaluation("FAILED", 0.43),
        },
      }),
    ]);
    const { rrByOutcome, rrByEvaluation } =
      aggregateHistoricalMeasurementRRStatistics(art, {}).rr;
    assert.equal(rrByEvaluation.LT_1_0.FAILED, 1);
    assert.equal(rrByOutcome.LT_1_0.TARGET_TOUCHED, 1);
  });

  it("Z: PASSED + INVALIDATION_TOUCHED", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "z",
        rrRatio: 2,
        outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(2),
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    const { rrByOutcome } = aggregateHistoricalMeasurementRRStatistics(art, {})
      .rr;
    assert.equal(rrByOutcome.FROM_2_0_TO_3_0.INVALIDATION_TOUCHED, 1);
  });

  it("AA: no filter", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1", rrRatio: 2 })]);
    const rr = aggregateHistoricalMeasurementRRStatistics(art, {});
    assert.equal(rr.rr.grandTotal, art.measurements.length);
  });

  it("AB–AE: cohort filters", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "display",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
        rrRatio: 2,
      }),
      entry({
        prospectiveSetupId: "ready",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "READY_REFERENCES"],
        rrRatio: 2,
      }),
      entry({
        prospectiveSetupId: "passed",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "TRADE_EVAL_PASSED"],
        rrRatio: 2,
      }),
      entry({
        prospectiveSetupId: "only-all",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
        rrRatio: 2,
      }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementRRStatistics(art, {
        cohorts: ["DISPLAY_PICK"],
      }).rr.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementRRStatistics(art, {
        cohorts: ["READY_REFERENCES"],
      }).rr.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementRRStatistics(art, {
        cohorts: ["TRADE_EVAL_PASSED"],
      }).rr.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementRRStatistics(art, {
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }).rr.grandTotal,
      4
    );
  });

  it("AF: cohort OR semantics", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", cohorts: ["DISPLAY_PICK"], rrRatio: 2 }),
      entry({
        prospectiveSetupId: "b",
        cohorts: ["READY_REFERENCES"],
        rrRatio: 2,
      }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementRRStatistics(art, {
        cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
      }).rr.grandTotal,
      2
    );
  });

  it("AG: cohort overlap on report.cohorts", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "overlap",
        cohorts: [
          "ALL_PRODUCTION_CANDIDATES",
          "READY_REFERENCES",
          "TRADE_EVAL_PASSED",
          "DISPLAY_PICK",
        ],
        rrRatio: 2,
      }),
    ]);
    const report = aggregateHistoricalMeasurementRRStatistics(art, {});
    assert.deepEqual(
      Object.keys(report.cohorts).sort(),
      [...HISTORICAL_MEASUREMENT_COHORTS].sort()
    );
    const membershipSum =
      report.cohorts.ALL_PRODUCTION_CANDIDATES.grandTotal +
      report.cohorts.DISPLAY_PICK.grandTotal;
    assert.ok(membershipSum > report.rr.grandTotal);
  });

  it("AH: deterministic repeated aggregation", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1", rrRatio: 1.6 })]);
    assert.deepEqual(
      aggregateHistoricalMeasurementRRStatistics(art, {}),
      aggregateHistoricalMeasurementRRStatistics(art, {})
    );
  });

  it("AI + AJ: artifact and filter immutability", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "p1", cohorts: ["DISPLAY_PICK"], rrRatio: 2 }),
    ]);
    const before = JSON.stringify(art);
    const filter = { cohorts: ["DISPLAY_PICK" as const] };
    const filterBefore = JSON.stringify(filter);
    aggregateHistoricalMeasurementRRStatistics(art, filter);
    assert.equal(JSON.stringify(art), before);
    assert.equal(JSON.stringify(filter), filterBefore);
  });

  it("AK: no WIN/LOSS on report", () => {
    const report = aggregateHistoricalMeasurementRRStatistics(
      artifact([entry({ prospectiveSetupId: "p1", rrRatio: 2 })]),
      {}
    );
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION
    );
    assert.ok(!("win" in report.rr));
    assert.ok(!("loss" in report.rr));
  });

  it("AL: RR at minimum threshold bucket", () => {
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(1.5),
      "FROM_1_5_TO_2_0"
    );
    for (const bucket of HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS) {
      assert.equal(typeof bucket, "string");
    }
  });

  it("AM: RR < 1.5 can still have TARGET_TOUCHED outcome", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "am",
        rrRatio: 1.4,
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: referencesWithRr(1.4),
          tradeEvaluation: minimalTradeEvaluation("FAILED", 1.4),
        },
      }),
    ]);
    const { rrByOutcome } = aggregateHistoricalMeasurementRRStatistics(art, {})
      .rr;
    assert.equal(rrByOutcome.FROM_1_0_TO_1_5.TARGET_TOUCHED, 1);
  });

  it("AN: same setup id different E remain separate observations", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:10:same",
        evaluationBarIndex: 10,
        rrRatio: 1.0,
      }),
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:11:same",
        evaluationBarIndex: 11,
        rrRatio: 2.0,
      }),
    ]);
    const { bucketCounts, grandTotal } = aggregateHistoricalMeasurementRRStatistics(
      art,
      {}
    ).rr;
    assert.equal(grandTotal, 2);
    assert.equal(bucketCounts.FROM_1_0_TO_1_5, 1);
    assert.equal(bucketCounts.FROM_2_0_TO_3_0, 1);
  });

  it("canonical RR reads references.rr.ratio only", () => {
    const e = entry({
      prospectiveSetupId: "canon",
      rrRatio: 1.8,
      evaluation: {
        historicalSetup: null,
        production: null,
        references: referencesWithRr(1.8),
        tradeEvaluation: minimalTradeEvaluation("PASSED", 99),
      },
    });
    assert.equal(resolveHistoricalMeasurementCanonicalRrRatio(e), 1.8);
    assert.equal(
      classifyHistoricalMeasurementRrBucketRow(
        resolveHistoricalMeasurementCanonicalRrRatio(e)
      ),
      "FROM_1_5_TO_2_0"
    );
  });

  it("B-9b outcome column parity", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        rrRatio: 2,
        outcome: outcomeAttachment("TARGET_TOUCHED"),
      }),
      entry({ prospectiveSetupId: "b", rrRatio: 2, outcome: null }),
    ]);
    const rr = aggregateHistoricalMeasurementRRStatistics(art, {}).rr;
    const core = aggregateHistoricalMeasurementStatisticsFiltered(art, {}).core;
    assert.equal(
      rr.outcomeColumnTotals.TARGET_TOUCHED,
      core.distributions.outcome.TARGET_TOUCHED
    );
    assert.equal(
      rr.outcomeColumnTotals[HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME],
      core.distributions.outcome.nullOutcome
    );
  });
});
