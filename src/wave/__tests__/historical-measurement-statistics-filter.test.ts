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
import type { HistoricalMeasurementCohort } from "../setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import { aggregateHistoricalMeasurementStatistics } from "../historical-measurement-statistics";
import {
  aggregateHistoricalMeasurementStatisticsFiltered,
  computeHistoricalMeasurementStatisticRate,
  measurementMatchesCohortFilter,
  selectHistoricalMeasurementEntries,
} from "../historical-measurement-statistics-filter";
import { HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION } from "../historical-measurement-statistics-filter-types";

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

const ALL_COHORTS: HistoricalMeasurementCohort[] = [
  "ALL_PRODUCTION_CANDIDATES",
  "READY_REFERENCES",
  "TRADE_EVAL_PASSED",
  "DISPLAY_PICK",
];

describe("historical measurement statistics filter (B-9b)", () => {
  it("A: no filter matches B-9a core population", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "p1" }),
      entry({ prospectiveSetupId: "p2" }),
    ]);
    const base = aggregateHistoricalMeasurementStatistics(art);
    const filtered = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.deepEqual(filtered.core, base);
    assert.equal(filtered.denominators.totalSnapshots, 2);
    assert.equal(filtered.denominators.filteredSnapshots, 2);
  });

  it("B–F: single cohort filters use artifact cohorts[]", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "only-all",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }),
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
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementStatisticsFiltered(art, {
        cohorts: ["DISPLAY_PICK"],
      }).denominators.filteredSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementStatisticsFiltered(art, {
        cohorts: ["READY_REFERENCES"],
      }).denominators.filteredSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementStatisticsFiltered(art, {
        cohorts: ["TRADE_EVAL_PASSED"],
      }).denominators.filteredSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementStatisticsFiltered(art, {
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }).denominators.filteredSnapshots,
      4
    );
  });

  it("G: multiple cohort filter uses OR semantics", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        cohorts: ["DISPLAY_PICK"],
      }),
      entry({
        prospectiveSetupId: "b",
        cohorts: ["READY_REFERENCES"],
      }),
      entry({
        prospectiveSetupId: "c",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }),
    ]);
    const report = aggregateHistoricalMeasurementStatisticsFiltered(art, {
      cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
    });
    assert.equal(report.denominators.filteredSnapshots, 2);
    assert.ok(
      selectHistoricalMeasurementEntries(art, {
        cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
      }).every((m) =>
        measurementMatchesCohortFilter(m, {
          cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
        })
      )
    );
  });

  it("H + Z: cohort overlap — membership sums may exceed totalSnapshots", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "overlap",
        cohorts: ALL_COHORTS,
      }),
      entry({
        prospectiveSetupId: "plain",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }),
    ]);
    const report = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.equal(report.denominators.totalSnapshots, 2);
    const membershipSum =
      report.cohorts.ALL_PRODUCTION_CANDIDATES.denominators.filteredSnapshots +
      report.cohorts.DISPLAY_PICK.denominators.filteredSnapshots;
    assert.ok(membershipSum > report.denominators.totalSnapshots);
  });

  it("I–Q: denominators and measurability", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
      entry({
        prospectiveSetupId: "b",
        outcome: outcomeAttachment("NO_FUTURE_DATA"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
      entry({
        prospectiveSetupId: "c",
        outcome: null,
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("INSUFFICIENT_CONTEXT"),
        },
      }),
    ]);
    const d = aggregateHistoricalMeasurementStatisticsFiltered(art, {})
      .denominators;
    assert.equal(d.filteredSnapshots, 3);
    assert.equal(d.measurablePaths, 1);
    assert.equal(d.unmeasurablePaths, 2);
    assert.equal(d.outcomeMeasured, 1);
    assert.equal(d.outcomeUnmeasured, 2);
    assert.equal(d.tradeEvaluated, 3);
    assert.equal(d.tradeEvaluationPassed, 1);
    assert.equal(d.tradeEvaluationFailed, 1);
    assert.equal(d.tradeEvaluationInsufficientContext, 1);
    assert.ok(d.filteredSnapshots >= d.measurablePaths);
  });

  it("R–S: rates with explicit denominators", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p1",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
      entry({
        prospectiveSetupId: "p2",
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const { rates, denominators } =
      aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.equal(rates.tradeEvaluationPassRate.numerator, 1);
    assert.equal(rates.tradeEvaluationPassRate.denominator, 2);
    assert.equal(rates.tradeEvaluationPassRate.denominatorId, "TRADE_EVALUATED");
    assert.equal(rates.tradeEvaluationPassRate.value, 0.5);
    assert.equal(rates.outcomeMeasuredRate.denominatorId, "FILTERED_SNAPSHOTS");
    assert.equal(
      rates.outcomeMeasuredRate.numerator,
      denominators.outcomeMeasured
    );
  });

  it("T + U: zero denominator rate is null", () => {
    const rate = computeHistoricalMeasurementStatisticRate(0, 0, "TRADE_EVALUATED");
    assert.equal(rate.value, null);
    assert.equal(rate.numerator, 0);
    assert.equal(rate.denominator, 0);
    const empty = aggregateHistoricalMeasurementStatisticsFiltered(
      artifact([]),
      {}
    );
    assert.equal(empty.rates.tradeEvaluationPassRate.value, null);
    assert.equal(empty.denominators.filteredSnapshots, 0);
  });

  it("V: deterministic repeated aggregation", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const a = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    const b = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    assert.deepEqual(a, b);
  });

  it("W: input immutability", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "p1",
        cohorts: ["DISPLAY_PICK"],
      }),
    ]);
    const before = JSON.stringify(art);
    aggregateHistoricalMeasurementStatisticsFiltered(art, {
      cohorts: ["DISPLAY_PICK"],
    });
    assert.equal(JSON.stringify(art), before);
  });

  it("X: FAILED + TARGET_TOUCHED independence under filter", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "x",
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
    ]);
    const core = aggregateHistoricalMeasurementStatisticsFiltered(art, {})
      .core;
    assert.equal(core.distributions.tradeEvaluation.FAILED, 1);
    assert.equal(core.distributions.outcome.TARGET_TOUCHED, 1);
  });

  it("Y: PASSED + INVALIDATION_TOUCHED independence under filter", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "y",
        outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: null,
          references: {} as never,
          tradeEvaluation: minimalTradeEvaluation("PASSED"),
        },
      }),
    ]);
    const core = aggregateHistoricalMeasurementStatisticsFiltered(art, {})
      .core;
    assert.equal(core.distributions.tradeEvaluation.PASSED, 1);
    assert.equal(core.distributions.outcome.INVALIDATION_TOUCHED, 1);
  });

  it("AA + AB: null outcome and NO_FUTURE_DATA unmeasured", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "n", outcome: null }),
      entry({
        prospectiveSetupId: "f",
        outcome: outcomeAttachment("NO_FUTURE_DATA"),
      }),
    ]);
    const d = aggregateHistoricalMeasurementStatisticsFiltered(art, {})
      .denominators;
    assert.equal(d.outcomeUnmeasured, 2);
    assert.equal(d.outcomeMeasured, 0);
    assert.equal(
      aggregateHistoricalMeasurementStatisticsFiltered(art, {}).core.distributions
        .outcome.nullOutcome,
      1
    );
  });

  it("AC: AMBIGUOUS counts as measurable path", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        outcome: outcomeAttachment("AMBIGUOUS"),
      }),
    ]);
    const d = aggregateHistoricalMeasurementStatisticsFiltered(art, {})
      .denominators;
    assert.equal(d.measurablePaths, 1);
    assert.equal(d.outcomeMeasured, 1);
  });

  it("AD: four B-8 cohort keys present on report", () => {
    const report = aggregateHistoricalMeasurementStatisticsFiltered(
      artifact([entry({ prospectiveSetupId: "p1" })]),
      {}
    );
    assert.deepEqual(
      Object.keys(report.cohorts).sort(),
      [...HISTORICAL_MEASUREMENT_COHORTS].sort()
    );
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION
    );
  });
});
