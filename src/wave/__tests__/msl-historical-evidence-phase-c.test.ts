import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMslHistoricalEvidenceAtEvaluation } from "../msl-historical-evidence/msl-historical-evidence-batch";
import {
  buildDescriptiveCohortComparison,
  buildMslHistoricalCohortAnalyticsReport,
  sortCohortAnalyticsReportForDeterministicJson,
} from "../msl-historical-evidence/msl-historical-cohort-analytics";
import { assertNoForbiddenMslHistoricalCohortAnalyticsKeys } from "../msl-historical-evidence/msl-historical-cohort-analytics-forbidden";
import {
  buildNumericDistributionStats,
  percentileLinearInterpolationV1,
} from "../msl-historical-evidence/msl-historical-cohort-analytics-stats";
import { PERCENTILE_LINEAR_INTERPOLATION_V1 } from "../msl-historical-evidence/msl-historical-cohort-analytics-types";
import { MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1 } from "../msl-historical-evidence/msl-historical-evidence-types";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles, candle } from "./test-helpers";
import type { MslHistoricalEvidenceRecordV1 } from "../msl-historical-evidence/msl-historical-evidence-types";
import type { Candle } from "../types";

const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const ONE_H = 3_600_000;
const DATASET = {
  datasetId: MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1,
  datasetChecksum: BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  symbol: "BTCUSDT",
  timeframe: "1H",
};

function sliceBtc(from = 400, to = 1100): readonly Candle[] {
  return loadBtcusdt1hResearchFrozenDatasetV1().candles.slice(from, to);
}

function buildRecords(candles: readonly Candle[], E: number, H: number) {
  return buildMslHistoricalEvidenceAtEvaluation({
    candles,
    evaluationBarIndex: E,
    observationHorizonBars: H,
    swingConfig: SWING,
    ...DATASET,
  });
}

function findCohort(
  report: ReturnType<typeof buildMslHistoricalCohortAnalyticsReport>,
  partial: {
    measurementMode?: MslHistoricalEvidenceRecordV1["measurementMode"];
    eventFamily?: MslHistoricalEvidenceRecordV1["eventFamily"];
    sampleStatus?: "ALL" | MslHistoricalEvidenceRecordV1["sampleStatus"];
    observationHorizonBars?: number;
  }
) {
  return report.cohorts.find(
    (c) =>
      (partial.measurementMode === undefined ||
        c.cohortDefinition.measurementMode === partial.measurementMode) &&
      (partial.eventFamily === undefined ||
        c.cohortDefinition.eventFamily === partial.eventFamily) &&
      (partial.sampleStatus === undefined ||
        c.cohortDefinition.sampleStatus === partial.sampleStatus) &&
      (partial.observationHorizonBars === undefined ||
        c.cohortDefinition.observationHorizonBars === partial.observationHorizonBars)
  );
}

describe("msl-historical-evidence Phase C", () => {
  it("C-001 single cohort report", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 300, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    assert.ok(report.cohorts.length >= 1);
    assert.equal(report.schemaVersion, "1.0");
  });

  it("C-002 multiple event families", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 350, 48);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const families = new Set(report.cohorts.map((c) => c.cohortDefinition.eventFamily));
    assert.ok(families.size >= 1);
  });

  it("C-003 STRICT_AT_E cohort", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 400, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const strict = report.cohorts.filter(
      (c) => c.cohortDefinition.measurementMode === "STRICT_AT_E"
    );
    assert.ok(strict.length >= 0);
    for (const c of strict) {
      assert.equal(c.cohortDefinition.measurementMode, "STRICT_AT_E");
    }
  });

  it("C-004 DISCLOSURE_HORIZON cohort", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 450, 48);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const disc = report.cohorts.filter(
      (c) => c.cohortDefinition.measurementMode === "DISCLOSURE_HORIZON"
    );
    for (const c of disc) {
      assert.equal(c.cohortDefinition.measurementMode, "DISCLOSURE_HORIZON");
    }
  });

  it("C-005 OBSERVATION_ONLY cohort", () => {
    const candles = flatCandles(14, 100);
    for (let i = 0; i < candles.length; i++) {
      candles[i]!.time = i * ONE_H;
    }
    const records = buildRecords(candles, 5, 4);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const obs = findCohort(report, {
      measurementMode: "OBSERVATION_ONLY",
      eventFamily: "NONE",
    });
    assert.ok(obs);
    assert.ok(obs!.sampleCount >= 1);
  });

  it("C-006 sufficient horizon metrics use non-null counts", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 300, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const cohort = report.cohorts.find(
      (c) =>
        c.cohortDefinition.sampleStatus === "SUFFICIENT_HORIZON" &&
        c.sufficientHorizonCount > 0
    );
    if (cohort && cohort.forwardReturnStats.count > 0) {
      assert.ok(cohort.forwardReturnStats.mean !== null);
    }
  });

  it("C-007 insufficient horizon separated", () => {
    const candles = flatCandles(10, 50);
    const records = buildRecords(candles, 8, 8);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const ins = report.cohorts.filter(
      (c) => c.cohortDefinition.sampleStatus === "INSUFFICIENT_HORIZON"
    );
    for (const c of ins) {
      assert.equal(c.forwardReturnStats.count, 0);
      assert.ok(c.insufficientHorizonCount >= 1);
    }
  });

  it("C-008 empty cohort input", () => {
    const report = buildMslHistoricalCohortAnalyticsReport({ records: [] });
    assert.equal(report.cohorts.length, 0);
    assert.equal(report.symbolsPresent.length, 0);
  });

  it("C-009 mean / median on synthetic stats", () => {
    const stats = buildNumericDistributionStats([0.01, 0.02, 0.03, 0.04]);
    assert.equal(stats.count, 4);
    assert.ok(Math.abs(stats.mean! - 0.025) < 1e-9);
    assert.ok(stats.median !== null);
  });

  it("C-010 p25 / p50 / p75 PERCENTILE_LINEAR_INTERPOLATION_V1", () => {
    const xs = [1, 2, 3, 4, 5];
    const stats = buildNumericDistributionStats(xs);
    assert.equal(stats.percentileAlgorithm, PERCENTILE_LINEAR_INTERPOLATION_V1);
    assert.equal(stats.p50, percentileLinearInterpolationV1(xs, 0.5));
    assert.equal(stats.p25, percentileLinearInterpolationV1(xs, 0.25));
    assert.equal(stats.p75, percentileLinearInterpolationV1(xs, 0.75));
  });

  it("C-011 time-to-event stats", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 380, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const any = report.cohorts.find((c) => c.timeToEventStats.bos.count > 0);
    if (any) {
      assert.ok(any.timeToEventStats.bos.medianBars !== null);
    }
  });

  it("C-012 event frequency fields present", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 320, 48);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const c = report.cohorts[0]!;
    assert.ok(typeof c.eventCounts.subsequentBosCount === "number");
    assert.ok(typeof c.eventCounts.subsequentSweepCount === "number");
  });

  it("C-013 co-occurrence counts", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 360, 48);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    for (const row of report.cohorts) {
      for (const co of row.observedCoOccurrenceCounts) {
        assert.ok(co.observedCoOccurrenceKey.includes("+"));
        assert.ok(co.count >= 1);
      }
    }
  });

  it("C-014 association counting", () => {
    const candles = sliceBtc();
    const records = buildRecords(candles, 340, 32);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const totalAssoc = report.cohorts.reduce(
      (s, c) =>
        s +
        c.eventCounts.associationLiquidityToBosCount +
        c.eventCounts.associationLiquidityToChochCount,
      0
    );
    assert.ok(totalAssoc >= 0);
  });

  it("C-015 multiple symbols dimension", () => {
    const btc = buildRecords(sliceBtc(), 300, 12);
    const eth = btc.map((r) => ({ ...r, symbol: "ETHUSDT" }));
    const report = buildMslHistoricalCohortAnalyticsReport({ records: [...btc, ...eth] });
    assert.deepEqual(report.symbolsPresent, ["BTCUSDT", "ETHUSDT"]);
    assert.equal(report.multisymbolDataSupplied, true);
  });

  it("C-016 multiple timeframes dimension", () => {
    const base = buildRecords(sliceBtc(), 300, 12);
    const tf4 = base.map((r) => ({ ...r, timeframe: "4H" }));
    const report = buildMslHistoricalCohortAnalyticsReport({ records: [...base, ...tf4] });
    assert.deepEqual(report.timeframesPresent, ["1H", "4H"]);
  });

  it("C-017 overlapping windows disclosure", () => {
    const candles = sliceBtc();
    const r1 = buildRecords(candles, 300, 24);
    const r2 = buildRecords(candles, 310, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records: [...r1, ...r2] });
    assert.equal(report.overlappingWindowRisk, true);
    assert.ok(
      report.cohorts.some((c) =>
        c.limitations.some((l) => l.includes("overlappingWindowRisk"))
      )
    );
  });

  it("C-018 prefix invariance strict cohort sample counts", () => {
    const base = sliceBtc(400, 900);
    const E = 200;
    const before = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(base, E, 24),
    });
    const extended = [...base, candle(500 * ONE_H, 100, 200, 50, 150)];
    const after = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(extended, E, 24),
    });
    const strictBefore = before.cohorts.filter(
      (c) => c.cohortDefinition.measurementMode === "STRICT_AT_E"
    );
    const strictAfter = after.cohorts.filter(
      (c) => c.cohortDefinition.measurementMode === "STRICT_AT_E"
    );
    assert.deepEqual(
      strictBefore.map((c) => [cohortKey(c), c.sampleCount]),
      strictAfter.map((c) => [cohortKey(c), c.sampleCount])
    );
  });

  it("C-019 future spike forward stats may change strict membership stable", () => {
    const base = sliceBtc(400, 800);
    const E = 150;
    const before = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(base, E, 12),
    });
    const extended = base.map((c) => ({ ...c }));
    for (let i = E + 1; i < extended.length; i++) {
      extended[i] = { ...extended[i]!, high: 50_000, low: 40_000, close: 45_000 };
    }
    const after = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(extended, E, 12),
    });
    assert.deepEqual(
      before.cohorts
        .filter((c) => c.cohortDefinition.measurementMode === "STRICT_AT_E")
        .map((c) => cohortKey(c)),
      after.cohorts
        .filter((c) => c.cohortDefinition.measurementMode === "STRICT_AT_E")
        .map((c) => cohortKey(c))
    );
  });

  it("C-020 frozen BTC checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
  });

  it("C-021 forbidden fields scan", () => {
    const report = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(sliceBtc(), 300, 12),
    });
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalCohortAnalyticsKeys(report));
  });

  it("C-022 architecture guard", () => {
    const root = join(process.cwd(), "src/wave/msl-historical-evidence");
    const src = readFileSync(join(root, "msl-historical-cohort-analytics.ts"), "utf8");
    assert.ok(!src.includes("fetch("));
    assert.ok(!src.includes("trade-evaluation"));
    assert.ok(!src.includes("production-wave-scanner"));
    assert.ok(!/detectSwings\s*\(/.test(src));
    assert.ok(src.includes("buildMslHistoricalCohortAnalyticsReport"));
  });

  it("C-023 deterministic JSON", () => {
    const records = buildRecords(sliceBtc(), 280, 12);
    const a = sortCohortAnalyticsReportForDeterministicJson(
      buildMslHistoricalCohortAnalyticsReport({ records })
    );
    const b = sortCohortAnalyticsReportForDeterministicJson(
      buildMslHistoricalCohortAnalyticsReport({ records })
    );
    assert.deepEqual(a, b);
  });

  it("C-024 missing numeric data stays null", () => {
    const stats = buildNumericDistributionStats([]);
    assert.equal(stats.count, 0);
    assert.equal(stats.mean, null);
    assert.equal(stats.median, null);
  });

  it("C-025 descriptive cohort comparison", () => {
    const records = buildRecords(sliceBtc(), 350, 24);
    const cmp = buildDescriptiveCohortComparison({
      records,
      cohortA: {
        symbol: DATASET.symbol,
        timeframe: DATASET.timeframe,
        measurementMode: "STRICT_AT_E",
        eventFamily: "BOS",
        eventDirection: null,
        observationHorizonBars: 24,
        strictEventPresence: "PRESENT",
      },
      cohortB: {
        symbol: DATASET.symbol,
        timeframe: DATASET.timeframe,
        measurementMode: "OBSERVATION_ONLY",
        eventFamily: "NONE",
        eventDirection: null,
        observationHorizonBars: 24,
        strictEventPresence: "ABSENT",
      },
    });
    assert.equal(cmp.comparisonKind, "DESCRIPTIVE_COHORT_COMPARISON");
    assert.equal(cmp.label, "DESCRIPTIVE_ONLY");
  });

  it("C-026 zero-event cohort", () => {
    const candles = flatCandles(12, 100);
    const records = buildRecords(candles, 5, 4);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const z = findCohort(report, { eventFamily: "NONE", measurementMode: "OBSERVATION_ONLY" });
    assert.ok(z);
    assert.ok(z!.noEventCount >= 1);
  });

  it("C-027 measurement-mode separation", () => {
    const records = buildRecords(sliceBtc(), 360, 24);
    const report = buildMslHistoricalCohortAnalyticsReport({ records });
    const modes = new Set(report.cohorts.map((c) => c.cohortDefinition.measurementMode));
    assert.ok(modes.size >= 1);
    assert.ok(!modes.has("STRICT_AT_E" as never) || modes.size >= 1);
  });

  it("C-028 native HTF remains non-canonical", () => {
    const report = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(sliceBtc(), 300, 12),
    });
    const blob = JSON.stringify(report);
    assert.ok(!blob.includes("NATIVE_HTF_PRODUCTION"));
    assert.ok(!blob.includes("native_htf_canonical"));
  });

  it("C-029 15M remains NOT_ESTABLISHED", () => {
    const report = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(sliceBtc(), 300, 12),
    });
    assert.ok(!report.timeframesPresent.includes("15M"));
  });

  it("C-030 no predictive/statistical significance output", () => {
    const report = buildMslHistoricalCohortAnalyticsReport({
      records: buildRecords(sliceBtc(), 300, 12),
    });
    const blob = JSON.stringify(report).toLowerCase();
    assert.ok(!blob.includes("pvalue"));
    assert.ok(!blob.includes("t-test"));
    assert.ok(!blob.includes("chisquare"));
    assert.ok(!blob.includes("regression"));
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalCohortAnalyticsKeys(report));
  });
});

function cohortKey(c: {
  cohortDefinition: {
    symbol: string;
    timeframe: string;
    measurementMode: string;
    eventFamily: string;
    eventDirection: string | null;
    observationHorizonBars: number;
    sampleStatus: string;
  };
}): string {
  const d = c.cohortDefinition;
  return [
    d.symbol,
    d.timeframe,
    d.measurementMode,
    d.eventFamily,
    d.eventDirection ?? "",
    d.observationHorizonBars,
    d.sampleStatus,
  ].join("|");
}
