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
import type { ProspectiveSetupProductionCandidate } from "../setup/prospective-setup-production-types";
import { PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT } from "../setup/prospective-setup-production-types";
import { TRADE_EVALUATION_MIN_RR } from "../setup/trade-evaluation-contract";
import type { TradeEvaluationStatus } from "../setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import { aggregateHistoricalMeasurementStatisticsFiltered } from "../historical-measurement-statistics-filter";
import {
  aggregateHistoricalMeasurementRRStatistics,
  resolveHistoricalMeasurementCanonicalRrRatio,
} from "../historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "../historical-measurement-rr-statistics-types";
import {
  aggregateHistoricalMeasurementDimensionStatistics,
  combineHistoricalMeasurementDimensionKeys,
  resolveHistoricalMeasurementDimensionSymbol,
  resolveHistoricalMeasurementDimensionTimeframe,
  resolveHistoricalMeasurementSetupFamily,
  sumDimensionSliceMapTotals,
  sumSymbolTimeframeSetupFamilyLeafTotals,
} from "../historical-measurement-dimension-statistics";
import {
  HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME,
} from "../historical-measurement-dimension-statistics-types";
import type { HistoricalMeasurementDimensionStatisticsSlice } from "../historical-measurement-dimension-statistics-types";

function production(
  familyId: string = PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
): ProspectiveSetupProductionCandidate {
  return {
    schemaVersion: "1.0",
    id: "prod-1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    familyId: familyId as typeof PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    semanticCategory: "PROSPECTIVE_TRADE_SETUP",
    sourceKind: "HISTORICAL_TRADE_SETUP",
    sourceSetupId: "src-1",
    sourceSetupTypeId: "impulse-continuation",
    status: "CONFIRMED",
    evaluationBarIndex: 10,
    prospectiveWaveLabel: null,
    observedDirection: "BULLISH",
    openLegResolution: {} as never,
    contract: {} as never,
    objectiveEligibility: {} as never,
    targetGateOutcome: {} as never,
    funnelFirstFailure: "COMPLETE",
    funnelReasonCode: null,
    futureSafe: true,
    usesLegacyPotentialAsProductionEvidence: false,
  };
}

function referencesWithRr(ratio: number | null): ProspectiveReferenceEvaluation {
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
      familyId?: string | null;
    }
): HistoricalMeasurementArtifactEntry {
  const prospectiveSetupId = patch.prospectiveSetupId;
  const rrRatio = patch.rrRatio === undefined ? 2 : patch.rrRatio;
  const fam =
    patch.familyId === null
      ? null
      : patch.familyId ?? PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT;
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
    evaluation:
      patch.evaluation ??
      ({
        historicalSetup: null,
        production: fam === null ? null : production(fam),
        references: referencesWithRr(rrRatio),
        tradeEvaluation: minimalTradeEvaluation("PASSED", rrRatio ?? 2),
      } as HistoricalMeasurementArtifactEntry["evaluation"]),
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

function sumRrBuckets(slice: HistoricalMeasurementDimensionStatisticsSlice): number {
  let total = 0;
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    total += slice.rrBucketCounts[row];
  }
  return total;
}

describe("historical measurement dimension statistics (B-9e)", () => {
  it("A: empty artifact", () => {
    const report = aggregateHistoricalMeasurementDimensionStatistics(
      artifact([]),
      {}
    );
    assert.equal(report.dimensions.global.totalSnapshots, 0);
    assert.deepEqual(Object.keys(report.dimensions.bySymbol), []);
  });

  it("B–C: symbol grouping", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", symbol: "BTCUSDT" }),
      entry({ prospectiveSetupId: "b", symbol: "ETHUSDT" }),
    ]);
    const { bySymbol } = aggregateHistoricalMeasurementDimensionStatistics(art, {})
      .dimensions;
    assert.equal(bySymbol.BTCUSDT.totalSnapshots, 1);
    assert.equal(bySymbol.ETHUSDT.totalSnapshots, 1);
    assert.equal(sumDimensionSliceMapTotals(bySymbol), 2);
  });

  it("D–E: timeframe grouping", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", timeframe: "1H" }),
      entry({ prospectiveSetupId: "b", timeframe: "4H" }),
    ]);
    const { byTimeframe } = aggregateHistoricalMeasurementDimensionStatistics(
      art,
      {}
    ).dimensions;
    assert.equal(byTimeframe["1H"].totalSnapshots, 1);
    assert.equal(byTimeframe["4H"].totalSnapshots, 1);
  });

  it("F–G: setup family grouping", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        familyId: PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
      }),
      entry({ prospectiveSetupId: "b", familyId: null }),
    ]);
    const { bySetupFamily } = aggregateHistoricalMeasurementDimensionStatistics(
      art,
      {}
    ).dimensions;
    assert.equal(
      bySetupFamily[PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT]
        .totalSnapshots,
      1
    );
    assert.equal(
      bySetupFamily[HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY]
        .totalSnapshots,
      1
    );
  });

  it("H–J: 1D resolvers", () => {
    const e = entry({ prospectiveSetupId: "r" });
    assert.equal(resolveHistoricalMeasurementDimensionSymbol(e), "BTCUSDT");
    assert.equal(resolveHistoricalMeasurementDimensionTimeframe(e), "1H");
    assert.equal(
      resolveHistoricalMeasurementSetupFamily(e),
      PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
    );
  });

  it("K–M: 2D combined keys", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "k",
        symbol: "BTCUSDT",
        timeframe: "1H",
      }),
    ]);
    const d = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions;
    const stKey = combineHistoricalMeasurementDimensionKeys("BTCUSDT", "1H");
    const sfKey = combineHistoricalMeasurementDimensionKeys(
      "BTCUSDT",
      PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
    );
    const tfKey = combineHistoricalMeasurementDimensionKeys(
      "1H",
      PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
    );
    assert.equal(d.bySymbolTimeframe[stKey].totalSnapshots, 1);
    assert.equal(d.bySymbolSetupFamily[sfKey].totalSnapshots, 1);
    assert.equal(d.byTimeframeSetupFamily[tfKey].totalSnapshots, 1);
  });

  it("N + dimension crossing: full 3D leaf", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "leaf",
        symbol: "BTCUSDT",
        timeframe: "1H",
        rrRatio: 1.8,
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: production(),
          references: referencesWithRr(1.8),
          tradeEvaluation: minimalTradeEvaluation("PASSED", 99),
        },
      }),
    ]);
    const leaf =
      art.measurements[0];
    const tree = aggregateHistoricalMeasurementDimensionStatistics(art, {})
      .dimensions.symbolTimeframeSetupFamily;
    const slice =
      tree.BTCUSDT["1H"][
        PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
      ];
    assert.equal(slice.totalSnapshots, 1);
    assert.equal(slice.tradeEvaluation.PASSED, 1);
    assert.equal(slice.outcome.TARGET_TOUCHED, 1);
    assert.equal(slice.rrBucketCounts.FROM_1_5_TO_2_0, 1);
    assert.equal(resolveHistoricalMeasurementCanonicalRrRatio(leaf), 1.8);
  });

  it("O–Q: null symbol, timeframe, setup family", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "s", symbol: "" }),
      entry({ prospectiveSetupId: "t", timeframe: "" }),
      entry({ prospectiveSetupId: "f", familyId: null }),
    ]);
    const d = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions;
    assert.equal(
      d.bySymbol[HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL].totalSnapshots,
      1
    );
    assert.equal(
      d.byTimeframe[HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME]
        .totalSnapshots,
      1
    );
    assert.equal(
      d.bySetupFamily[HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY]
        .totalSnapshots,
      1
    );
  });

  it("R–T: distributions on global slice", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "a",
        rrRatio: 1.5,
        outcome: outcomeAttachment("NO_FUTURE_DATA"),
        evaluation: {
          historicalSetup: null,
          production: production(),
          references: referencesWithRr(1.5),
          tradeEvaluation: minimalTradeEvaluation("FAILED"),
        },
      }),
      entry({
        prospectiveSetupId: "b",
        rrRatio: null,
        outcome: null,
        evaluation: {
          historicalSetup: null,
          production: production(),
          references: referencesWithRr(null),
          tradeEvaluation: minimalTradeEvaluation("INSUFFICIENT_CONTEXT"),
        },
      }),
    ]);
    const g = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions
      .global;
    assert.equal(g.tradeEvaluation.FAILED, 1);
    assert.equal(g.tradeEvaluation.INSUFFICIENT_CONTEXT, 1);
    assert.equal(g.outcome.NO_FUTURE_DATA, 1);
    assert.equal(g.outcome.nullOutcome, 1);
    assert.equal(g.rrBucketCounts.FROM_1_5_TO_2_0, 1);
    assert.equal(g.rrBucketCounts.NULL_OR_INVALID_RR, 1);
  });

  it("U–X: parity with B-9b and B-9d", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "1", rrRatio: 2 }),
      entry({ prospectiveSetupId: "2", rrRatio: 0.5 }),
    ]);
    const report = aggregateHistoricalMeasurementDimensionStatistics(art, {});
    const filtered = aggregateHistoricalMeasurementStatisticsFiltered(art, {});
    const rrReport = aggregateHistoricalMeasurementRRStatistics(art, {});
    const d = report.dimensions;
    assert.equal(d.global.totalSnapshots, filtered.denominators.filteredSnapshots);
    assert.equal(
      sumSymbolTimeframeSetupFamilyLeafTotals(d.symbolTimeframeSetupFamily),
      filtered.denominators.filteredSnapshots
    );
    assert.equal(sumDimensionSliceMapTotals(d.bySymbol), 2);
    assert.equal(
      d.global.tradeEvaluation.PASSED,
      filtered.core.distributions.tradeEvaluation.PASSED
    );
    assert.equal(
      d.global.outcome.NO_TOUCH,
      filtered.core.distributions.outcome.NO_TOUCH
    );
    assert.equal(sumRrBuckets(d.global), rrReport.rr.grandTotal);
  });

  it("Y–AC: cohort filters", () => {
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
      aggregateHistoricalMeasurementDimensionStatistics(art, {
        cohorts: ["DISPLAY_PICK"],
      }).dimensions.global.totalSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementDimensionStatistics(art, {
        cohorts: ["READY_REFERENCES"],
      }).dimensions.global.totalSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementDimensionStatistics(art, {
        cohorts: ["TRADE_EVAL_PASSED"],
      }).dimensions.global.totalSnapshots,
      1
    );
    assert.equal(
      aggregateHistoricalMeasurementDimensionStatistics(art, {
        cohorts: ["ALL_PRODUCTION_CANDIDATES"],
      }).dimensions.global.totalSnapshots,
      4
    );
  });

  it("AD: cohort OR semantics", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", cohorts: ["DISPLAY_PICK"] }),
      entry({ prospectiveSetupId: "b", cohorts: ["READY_REFERENCES"] }),
    ]);
    assert.equal(
      aggregateHistoricalMeasurementDimensionStatistics(art, {
        cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
      }).dimensions.global.totalSnapshots,
      2
    );
  });

  it("AE: cohort overlap", () => {
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
    ]);
    const report = aggregateHistoricalMeasurementDimensionStatistics(art, {});
    const membershipSum =
      report.cohorts.ALL_PRODUCTION_CANDIDATES.global.totalSnapshots +
      report.cohorts.DISPLAY_PICK.global.totalSnapshots;
    assert.ok(membershipSum > report.dimensions.global.totalSnapshots);
    assert.deepEqual(
      Object.keys(report.cohorts).sort(),
      [...HISTORICAL_MEASUREMENT_COHORTS].sort()
    );
  });

  it("AF–AG: same setup / prospective id different E", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:100:same",
        evaluationBarIndex: 100,
      }),
      entry({
        prospectiveSetupId: "same",
        snapshotId: "BTCUSDT:1H:110:same",
        evaluationBarIndex: 110,
      }),
    ]);
    const leaf = aggregateHistoricalMeasurementDimensionStatistics(art, {})
      .dimensions.symbolTimeframeSetupFamily.BTCUSDT["1H"][
      PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
    ];
    assert.equal(leaf.totalSnapshots, 2);
  });

  it("AH + AX: deterministic ordering and combined keys", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "z", symbol: "ZZZUSDT" }),
      entry({ prospectiveSetupId: "a", symbol: "AAAUSDT" }),
    ]);
    const keys = Object.keys(
      aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions.bySymbol
    );
    assert.deepEqual(keys, ["AAAUSDT", "ZZZUSDT"]);
    assert.equal(
      combineHistoricalMeasurementDimensionKeys("BTC", "1H"),
      `BTC\u001f1H`
    );
  });

  it("AI: repeated aggregation", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    assert.deepEqual(
      aggregateHistoricalMeasurementDimensionStatistics(art, {}),
      aggregateHistoricalMeasurementDimensionStatistics(art, {})
    );
  });

  it("AJ–AK: immutability and no WIN/LOSS", () => {
    const art = artifact([entry({ prospectiveSetupId: "p1" })]);
    const before = JSON.stringify(art);
    const filter = { cohorts: ["ALL_PRODUCTION_CANDIDATES" as const] };
    const filterBefore = JSON.stringify(filter);
    const report = aggregateHistoricalMeasurementDimensionStatistics(art, filter);
    assert.equal(JSON.stringify(art), before);
    assert.equal(JSON.stringify(filter), filterBefore);
    assert.equal(
      report.statisticsSchemaVersion,
      HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION
    );
    assert.ok(!("win" in report.dimensions.global));
  });

  it("AL–AN: outcome observations not WIN/LOSS", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "t",
        outcome: outcomeAttachment("TARGET_TOUCHED"),
      }),
      entry({
        prospectiveSetupId: "i",
        outcome: outcomeAttachment("INVALIDATION_TOUCHED"),
      }),
    ]);
    const g = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions
      .global;
    assert.equal(g.outcome.TARGET_TOUCHED, 1);
    assert.equal(g.outcome.INVALIDATION_TOUCHED, 1);
    assert.ok(!("WIN" in g.outcome));
  });

  it("AO–AP: canonical RR from references only", () => {
    const e = entry({
      prospectiveSetupId: "ao",
      rrRatio: 1.5,
      evaluation: {
        historicalSetup: null,
        production: production(),
        references: referencesWithRr(1.5),
        tradeEvaluation: minimalTradeEvaluation("PASSED", 9),
      },
    });
    const g = aggregateHistoricalMeasurementDimensionStatistics(
      artifact([e]),
      {}
    ).dimensions.global;
    assert.equal(g.rrBucketCounts.FROM_1_5_TO_2_0, 1);
  });

  it("AQ–AR: RR boundaries 1.50 and 3.00", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "a", rrRatio: 1.5 }),
      entry({ prospectiveSetupId: "b", rrRatio: 3.0 }),
    ]);
    const g = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions
      .global;
    assert.equal(g.rrBucketCounts.FROM_1_5_TO_2_0, 1);
    assert.equal(g.rrBucketCounts.GTE_3_0, 1);
  });

  it("AS–AT: NO_FUTURE_DATA and NULL_OUTCOME retained", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "f",
        outcome: outcomeAttachment("NO_FUTURE_DATA"),
      }),
      entry({ prospectiveSetupId: "n", outcome: null }),
    ]);
    const g = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions
      .global;
    assert.equal(g.outcome.NO_FUTURE_DATA, 1);
    assert.equal(g.outcome.nullOutcome, 1);
  });

  it("AU–AW: leaf totals and no duplicate counting", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "1",
        symbol: "BTCUSDT",
        timeframe: "1H",
      }),
      entry({
        prospectiveSetupId: "2",
        symbol: "ETHUSDT",
        timeframe: "4H",
        familyId: null,
      }),
    ]);
    const d = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions;
    assert.equal(
      sumSymbolTimeframeSetupFamilyLeafTotals(d.symbolTimeframeSetupFamily),
      2
    );
    const leafSum =
      (d.symbolTimeframeSetupFamily.BTCUSDT?.["1H"]?.[
        PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT
      ]?.totalSnapshots ?? 0) +
      (d.symbolTimeframeSetupFamily.ETHUSDT?.["4H"]?.[
        HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY
      ]?.totalSnapshots ?? 0);
    assert.equal(leafSum, 2);
  });

  it("AV: all 1D maps reconcile to filtered total", () => {
    const art = artifact([
      entry({ prospectiveSetupId: "1", symbol: "BTCUSDT", timeframe: "1H" }),
      entry({ prospectiveSetupId: "2", symbol: "ETHUSDT", timeframe: "1H" }),
    ]);
    const d = aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions;
    const n = 2;
    assert.equal(sumDimensionSliceMapTotals(d.bySymbol), n);
    assert.equal(sumDimensionSliceMapTotals(d.byTimeframe), n);
    assert.equal(sumDimensionSliceMapTotals(d.bySetupFamily), n);
    assert.equal(sumDimensionSliceMapTotals(d.bySymbolTimeframe), n);
  });

  it("Y/Z style: FAILED+TARGET and low RR+TARGET", () => {
    const art = artifact([
      entry({
        prospectiveSetupId: "y",
        rrRatio: 0.43,
        outcome: outcomeAttachment("TARGET_TOUCHED"),
        evaluation: {
          historicalSetup: null,
          production: production(),
          references: referencesWithRr(0.43),
          tradeEvaluation: minimalTradeEvaluation("FAILED", 0.43),
        },
      }),
    ]);
    const leaf =
      aggregateHistoricalMeasurementDimensionStatistics(art, {}).dimensions.global;
    assert.equal(leaf.tradeEvaluation.FAILED, 1);
    assert.equal(leaf.outcome.TARGET_TOUCHED, 1);
    assert.equal(leaf.rrBucketCounts.LT_1_0, 1);
  });
});
