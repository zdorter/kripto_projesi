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
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import { aggregateHistoricalMeasurementStatistics } from "../historical-measurement-statistics";
import { aggregateHistoricalMeasurementStatisticsFiltered } from "../historical-measurement-statistics-filter";
import {
  aggregateHistoricalMeasurementCrossStatistics,
  emptyHistoricalMeasurementEvalOutcomeMatrix,
  resolveCrossOutcomeColumn,
} from "../historical-measurement-cross-statistics";
import {
  HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS,
  HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME,
  HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS,
  HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION,
} from "../historical-measurement-cross-statistics-types";

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
      production: null,
      references: {} as never,
      tradeEvaluation: minimalTradeEvaluation("PASSED"),
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

function assertMatrixShape(matrix: ReturnType<typeof emptyHistoricalMeasurementEvalOutcomeMatrix>) {
  for (const row of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
    for (const col of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
      assert.equal(typeof matrix[row][col], "number");
    }
  }
}

describe("historical measurement cross statistics (B-9c)", () => {
  it("A: empty artifact — zero matrix and totals", () => {
    const report = aggregateHistoricalMeasurementCrossStatistics(artifact([]), {});
    assert.equal(report.cross.grandTotal, 0);
    assertMatrixShape(report.cross.matrix);
    for (const row of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
      assert.equal(report.cross.rowTotals[row], 0);
    }
    for (const col of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
      assert.equal(report.cross.columnTotals[col], 0);
    }
  });

  it("B: single matrix cell", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p1",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.TARGET_TOUCHED, 1);
    assert.equal(cross.grandTotal, 1);
  });

  it("C: multiple matrix cells", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        outcome: outcomeAttachment("NO_TOUCH"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
      entry({
        prospectiveSetupId: "b",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.NO_TOUCH, 1);
    assert.equal(cross.matrix.FAILED.TARGET_TOUCHED, 1);
    assert.equal(cross.grandTotal, 2);
  });

  it("D: all three trade evaluation statuses", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
      entry({
        prospectiveSetupId: "f",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
      entry({
        prospectiveSetupId: "i",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("INSUFFICIENT_CONTEXT"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.rowTotals.PASSED, 1);
    assert.equal(cross.rowTotals.FAILED, 1);
    assert.equal(cross.rowTotals.INSUFFICIENT_CONTEXT, 1);
  });

  it("E: all six B-6 outcome columns represented across rows", () => {
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
        outcome: outcomeAttachment(o),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      })
    );
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(
      artifact(measurements),
      {}
    );
    for (const o of outcomes) {
      assert.equal(cross.columnTotals[o], 1);
      assert.equal(cross.matrix.PASSED[o], 1);
    }
  });

  it("F: null outcome uses NULL_OUTCOME column", () => {
    const art = artifact([entry({ prospectiveSetupId: "n", outcome: null })]);
    assert.equal(
      resolveCrossOutcomeColumn(art.measurements[0]),
      HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME
    );
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.NULL_OUTCOME, 1);
    assert.equal(cross.columnTotals.NULL_OUTCOME, 1);
  });

  it("G: FAILED × TARGET_TOUCHED", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "g",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.FAILED.TARGET_TOUCHED, 1);
  });

  it("H: PASSED × INVALIDATION_TOUCHED", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "h",
        outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.INVALIDATION_TOUCHED, 1);
  });

  it("I: AMBIGUOUS counted in matrix", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        outcome: outcomeAttachment("AMBIGUOUS"),
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.AMBIGUOUS, 1);
    assert.equal(cross.columnTotals.AMBIGUOUS, 1);
  });

  it("J: NO_FUTURE_DATA counted in matrix", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "j",
        outcome: outcomeAttachment("NO_FUTURE_DATA"),
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.NO_FUTURE_DATA, 1);
  });

  it("K: INSUFFICIENT_CONTEXT outcome counted in matrix", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "k",
        outcome: outcomeAttachment("INSUFFICIENT_CONTEXT"),
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.PASSED.INSUFFICIENT_CONTEXT, 1);
  });

  it("L: grand total equals filteredSnapshots (B-9b parity)", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "1" }),
      entry({ prospectiveSetupId: "2" }),
    ]);
    const cross = aggregateHistoricalMeasurementCrossStatistics(art, {});
    const filtered = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.equal(cross.cross.grandTotal, filtered.denominators.filteredSnapshots);
  });

  it("M + N + B-9b parity: row and column totals match distributions", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "1",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
      entry({
        prospectiveSetupId: "2",
        outcome: null,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    const report = aggregateHistoricalMeasurementCrossStatistics(art, {});
    const core = aggregateHistoricalMeasurementStatisticsFiltered(art, {}).core;
    assert.equal(
      report.cross.rowTotals.PASSED,
      core.distributions.tradeEvaluation.PASSED
    );
    assert.equal(
      report.cross.rowTotals.FAILED,
      core.distributions.tradeEvaluation.FAILED
    );
    assert.equal(
      report.cross.columnTotals.TARGET_TOUCHED,
      core.distributions.outcome.TARGET_TOUCHED
    );
    assert.equal(
      report.cross.columnTotals.NULL_OUTCOME,
      core.distributions.outcome.nullOutcome
    );
    const rowSum = Object.values(report.cross.rowTotals).reduce((a, b) => a + b, 0);
    const colSum = Object.values(report.cross.columnTotals).reduce(
      (a, b) => a + b,
      0
    );
    assert.equal(rowSum, report.cross.grandTotal);
    assert.equal(colSum, report.cross.grandTotal);
  });

  it("O: no filter parity with B-9b population", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const cross = aggregateHistoricalMeasurementCrossStatistics(art, {});
    const filtered = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.equal(
      cross.cross.grandTotal,
      filtered.denominators.filteredSnapshots
    );
    assert.equal(cross.cross.grandTotal, art.measurements.length);
  });

  it("P–S: cohort filters on cross matrix", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "display",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "DISPLAY_PICK"],
      }),
      entry({
        prospectiveSetupId: "ready",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "READY_REFERENCES"],
      }),
      entry({
        prospectiveSetupId: "passed",
        cohorts: ["ALL_PRODUCTION_CANDIDATES", "TRADE_EVAL_PASSED"],
      }),
      entry({
        prospectiveSetupId: "only-all",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementCrossStatistics(art, {
        cohorts: ["DISPLAY_PICK"],
      }).cross.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementCrossStatistics(art, {
        cohorts: ["READY_REFERENCES"],
      }).cross.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementCrossStatistics(art, {
        cohorts: ["TRADE_EVAL_PASSED"],
      }).cross.grandTotal,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementCrossStatistics(art, {
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }).cross.grandTotal,
      4
    );
  });

  it("T: multiple cohort OR semantics", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", cohorts: ["DISPLAY_PICK"] }),
      entry({ prospectiveSetupId: "b", cohorts: ["READY_REFERENCES"] }),
      entry({ prospectiveSetupId: "c", cohorts: ["ALL_PRODUCTION_CANDIDATES"] }),
    ]);
    const gt = aggregateHistoricalMeasurementCrossStatistics(art, {
      cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
    }).cross.grandTotal;
    assert.equal(gt, 2);
  });

  it("U: cohort overlap on report.cohorts slices", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "overlap",
        cohorts: [
          "ALL_PRODUCTION_CANDIDATES",
          "READY_REFERENCES",
          "TRADE_EVAL_PASSED",
          "DISPLAY_PICK",
        ],
      }),
      entry({
        prospectiveSetupId: "plain",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }),
    ]);
    const report = aggregateHistoricalMeasurementCrossStatistics(art, {});
    const membershipSum =
      report.cohorts.ALL_PRODUCTION_CANDIDATES.grandTotal +
      report.cohorts.DISPLAY_PICK.grandTotal;
    assert.ok(membershipSum > report.cross.grandTotal);
    assert.deepEqual(
      Object.keys(report.cohorts).sort(),
      [...HISTORICAL_MEASUREMENT_COHORTS].sort()
    );
  });

  it("V: zero cells present and deterministic", () => {
    const matrix = emptyHistoricalMeasurementEvalOutcomeMatrix();
    assert.equal(matrix.FAILED.AMBIGUOUS, 0);
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const a = aggregateHistoricalMeasurementCrossStatistics(art, {});
    const b = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.deepEqual(a.cross.matrix, b.cross.matrix);
  });

  it("W: repeated aggregation deterministic", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "p1" }),
      entry({ prospectiveSetupId: "p2" }),
    ]);
    assert.deepEqual(
      aggregateHistoricalMeasurementCrossStatistics(art, {}),
      aggregateHistoricalMeasurementCrossStatistics(art, {})
    );
  });

  it("X: input immutability", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const before = JSON.stringify(art);
    aggregateHistoricalMeasurementCrossStatistics(art, {
      cohorts: ["ALL_PRODUCTION_CANDIDATES"],
    });
    assert.equal(JSON.stringify(art), before);
  });

  it("Y: no WIN/LOSS mapping in module surface", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "y",
        outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.FAILED.INVALIDATION_TOUCHED, 1);
    const report = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION
    );
    assert.ok(!("win" in report.cross));
    assert.ok(!("loss" in report.cross));
  });

  it("Z: filter does not mutate artifact", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "p1", cohorts: ["DISPLAY_PICK"] }),
    ]);
    const snap = JSON.stringify(art);
    aggregateHistoricalMeasurementCrossStatistics(art, {
      cohorts: ["DISPLAY_PICK"],
    });
    assert.equal(JSON.stringify(art), snap);
  });

  it("AA: evaluation/outcome independence", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "aa",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("INSUFFICIENT_CONTEXT"),
        },
      }),
    ]);
    const core = aggregateHistoricalMeasurementStatistics(art);
    assert.equal(core.distributions.tradeEvaluation.INSUFFICIENT_CONTEXT, 1);
    assert.equal(core.distributions.outcome.TARGET_TOUCHED, 1);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.matrix.INSUFFICIENT_CONTEXT.TARGET_TOUCHED, 1);
  });

  it("AB: same prospectiveSetupId across snapshots — separate observations", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:10:same",
        evaluationBarIndex: 10,
      }),
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:11:same",
        evaluationBarIndex: 11,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { cross } = aggregateHistoricalMeasurementCrossStatistics(art, {});
    assert.equal(cross.grandTotal, 2);
    assert.equal(cross.rowTotals.PASSED, 1);
    assert.equal(cross.rowTotals.FAILED, 1);
  });

  it("AC: different evaluation bars remain separate observations", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p1",
        evaluationBarIndex: 5,
        snapshotId: "BTCUSDT:1H:5:p1",
      }),
      entry({
        prospectiveSetupId: "p2",
        evaluationBarIndex: 6,
        snapshotId: "BTCUSDT:1H:6:p2",
      }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementCrossStatistics(art, {}).cross.grandTotal,
      2
    );
  });
});
