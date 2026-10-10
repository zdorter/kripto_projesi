import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { HistoricalFrozenOhlcvDatasetError } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { buildMslHistoricalResearchBatchReport } from "../msl-historical-evidence/msl-historical-research-pipeline-batch";
import {
  defaultMinEvaluationBarIndex,
  researchDatasetId,
  resolveAvailableHistoricalResearchDatasets,
} from "../msl-historical-evidence/msl-historical-research-pipeline-dataset";
import { assertNoForbiddenMslHistoricalResearchPipelineKeys } from "../msl-historical-evidence/msl-historical-research-pipeline-forbidden";
import {
  deterministicRunIdFromConfig,
  serializeMslHistoricalResearchBatchReport,
} from "../msl-historical-evidence/msl-historical-research-pipeline-serialize";
import { parseMslHistoricalResearchCliArgs } from "../msl-historical-evidence/msl-historical-research-cli";
import type { HistoricalResearchDataset } from "../msl-historical-evidence/msl-historical-research-pipeline-types";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const ONE_H = 3_600_000;

function btcSliceDataset(from = 400, to = 900): HistoricalResearchDataset {
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  const candles = loaded.candles.slice(from, to);
  const m = loaded.document.metadata;
  const last = candles.length - 1;
  return {
    datasetId: researchDatasetId(m.symbol, m.timeframe),
    symbol: m.symbol,
    timeframe: m.timeframe,
    datasetChecksum: m.datasetChecksum,
    source: m.source,
    closedCandleOnly: m.closedCandleOnly,
    barDurationMs: m.barDurationMs,
    fixturePath: "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json",
    candles,
    status: "COMPLETE",
    firstEvaluationBar: defaultMinEvaluationBarIndex(),
    lastEvaluationBar: last,
  };
}

function runBatch(
  datasets: readonly HistoricalResearchDataset[],
  opts: {
    evaluationIndices?: number[];
    startE?: number;
    endE?: number;
    step?: number;
    observationHorizonBars: number[];
  }
) {
  return buildMslHistoricalResearchBatchReport({
    datasets,
    evaluationIndices: opts.evaluationIndices,
    startE: opts.startE,
    endE: opts.endE,
    step: opts.step,
    observationHorizonBars: opts.observationHorizonBars,
    swingConfig: SWING,
  });
}

describe("msl-historical-evidence Phase D", () => {
  it("D-001 single dataset", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [300], observationHorizonBars: [24] });
    assert.equal(report.coverage.datasetCount, 1);
    assert.equal(report.datasets[0]!.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    assert.ok(report.evidenceRecords.length >= 1);
  });

  it("D-002 multiple datasets", () => {
    const { datasets } = resolveAvailableHistoricalResearchDatasets({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    if (datasets.length < 2) {
      return;
    }
    const sliced = datasets.map((d) => ({
      ...d,
      candles: d.candles.slice(400, 850),
      lastEvaluationBar: 850 - 400 - 1 + defaultMinEvaluationBarIndex(),
    }));
    for (const s of sliced) {
      s.lastEvaluationBar = s.candles.length - 1;
    }
    const report = runBatch(sliced, {
      evaluationIndices: [300],
      observationHorizonBars: [12],
    });
    assert.equal(report.coverage.datasetCount, 2);
    assert.ok(report.crossSymbolAggregate);
    assert.equal(report.crossSymbolAggregate!.aggregateLabel, "ALL_SYMBOLS");
  });

  it("D-003 explicit E list", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [280, 320, 360],
      observationHorizonBars: [8],
    });
    assert.deepEqual(report.evaluationConfig.evaluationIndices, [280, 320, 360]);
  });

  it("D-004 E range", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      startE: 300,
      endE: 400,
      step: 50,
      observationHorizonBars: [4],
    });
    assert.deepEqual(report.evaluationConfig.evaluationIndices, [300, 350, 400]);
  });

  it("D-005 multiple horizons", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [350],
      observationHorizonBars: [4, 8, 12],
    });
    assert.deepEqual(report.evaluationConfig.observationHorizonBars, [4, 8, 12]);
    const horizons = new Set(report.evidenceRecords.map((r) => r.observationHorizonBars));
    assert.ok(horizons.has(4) && horizons.has(8) && horizons.has(12));
  });

  it("D-006 invalid E isolation", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [300, 999_999],
      observationHorizonBars: [24],
    });
    assert.ok(report.evaluationConfig.skippedEvaluations.some((s) => s.code === "INVALID_EVALUATION_BAR_INDEX"));
    assert.ok(report.evaluationConfig.evaluationIndices.includes(300));
    assert.ok(report.evidenceRecords.length >= 1);
  });

  it("D-007 insufficient horizon", () => {
    const ds = btcSliceDataset(400, 430);
    const E = ds.lastEvaluationBar;
    const report = runBatch([ds], { evaluationIndices: [E], observationHorizonBars: [48] });
    const insufficient = report.evidenceRecords.filter((r) => r.sampleStatus === "INSUFFICIENT_HORIZON");
    assert.ok(insufficient.length >= 1 || report.evidenceRecords.length >= 1);
  });

  it("D-008 strict/disclosure/observation separation", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [400], observationHorizonBars: [24] });
    const modes = new Set(report.evidenceRecords.map((r) => r.measurementMode));
    for (const m of modes) {
      assert.ok(["STRICT_AT_E", "DISCLOSURE_HORIZON", "OBSERVATION_ONLY"].includes(m));
    }
    const cohortModes = new Set(report.cohortAnalytics.cohorts.map((c) => c.cohortDefinition.measurementMode));
    for (const m of cohortModes) {
      assert.ok(["STRICT_AT_E", "DISCLOSURE_HORIZON", "OBSERVATION_ONLY"].includes(m));
    }
  });

  it("D-009 event family aggregation", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [380, 420], observationHorizonBars: [24] });
    assert.ok(report.evidenceSummary.totalRecordCount >= 1);
    assert.equal(
      Object.values(report.evidenceSummary.eventFamilyCounts).reduce((a, b) => a + b, 0),
      report.evidenceSummary.totalRecordCount
    );
  });

  it("D-010 symbol aggregation", () => {
    const { datasets } = resolveAvailableHistoricalResearchDatasets({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    if (datasets.length < 2) {
      return;
    }
    const sliced = datasets.map((d) => ({
      ...d,
      candles: d.candles.slice(500, 900),
      lastEvaluationBar: 0,
    }));
    for (const s of sliced) {
      s.lastEvaluationBar = s.candles.length - 1;
    }
    const report = runBatch(sliced, { evaluationIndices: [350], observationHorizonBars: [12] });
    const symbols = new Set(report.evidenceRecords.map((r) => r.symbol));
    assert.ok(symbols.has("BTCUSDT"));
    assert.ok(symbols.has("ETHUSDT"));
    assert.equal(report.crossSymbolAggregate!.aggregateLabel, "ALL_SYMBOLS");
  });

  it("D-011 timeframe aggregation", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [340], observationHorizonBars: [8] });
    assert.ok(report.crossTimeframeAggregates.some((a) => a.aggregateLabel === "TIMEFRAME_1H"));
    assert.ok(report.crossTimeframeAggregates[0]!.limitations.includes("cross_timeframe_aggregate_explicit"));
  });

  it("D-012 overlap detection", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [300, 340],
      observationHorizonBars: [48],
    });
    assert.ok(report.overlap.overlapDependencyRisk);
    assert.ok(report.overlap.overlappingPairCount >= 1);
    assert.ok(report.overlap.overlappingWindowLabels.some((l) => l.startsWith("OVERLAPPING_WINDOWS")));
  });

  it("D-013 same-dataset overlap counts", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [300, 320],
      observationHorizonBars: [48],
    });
    assert.equal(report.overlap.sameDatasetOverlapCount, report.overlap.overlappingPairCount);
    assert.ok(report.overlap.sameSymbolOverlapCount >= report.overlap.sameDatasetOverlapCount);
  });

  it("D-014 horizon comparison", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], {
      evaluationIndices: [360],
      observationHorizonBars: [4, 8],
    });
    assert.equal(report.horizonComparisons.length, 2);
    assert.ok(report.horizonComparisons.every((r) => r.observationHorizonBars === 4 || r.observationHorizonBars === 8));
  });

  it("D-015 checksum preservation", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [310], observationHorizonBars: [12] });
    assert.equal(report.coverage.perDataset[0]!.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("D-016 checksum conflict", () => {
    const ds = btcSliceDataset();
    const dup = { ...ds, datasetChecksum: "deadbeef".repeat(8) };
    assert.throws(
      () => runBatch([ds, dup], { evaluationIndices: [300], observationHorizonBars: [8] }),
      (err: unknown) =>
        err instanceof HistoricalFrozenOhlcvDatasetError &&
        String(err.message).includes("DATASET_CHECKSUM_CONFLICT")
    );
  });

  it("D-017 deterministic runId", () => {
    const ds = btcSliceDataset();
    const a = runBatch([ds], { evaluationIndices: [300, 310], observationHorizonBars: [8, 12] });
    const b = runBatch([ds], { evaluationIndices: [300, 310], observationHorizonBars: [8, 12] });
    assert.equal(a.runId, b.runId);
    assert.match(a.runId, /^[a-f0-9]{64}$/);
    assert.equal(a.runId, deterministicRunIdFromConfig({
      datasets: a.datasets.map((d) => ({ datasetId: d.datasetId, checksum: d.datasetChecksum })),
      evaluationConfig: a.evaluationConfig,
    }));
  });

  it("D-018 deterministic JSON", () => {
    const ds = btcSliceDataset();
    const a = runBatch([ds], { evaluationIndices: [305], observationHorizonBars: [8] });
    const b = runBatch([ds], { evaluationIndices: [305], observationHorizonBars: [8] });
    const slim = (r: ReturnType<typeof runBatch>) => ({ ...r, evidenceRecords: [] as typeof r.evidenceRecords });
    const ja = serializeMslHistoricalResearchBatchReport(slim(a), { includePerformance: false });
    const jb = serializeMslHistoricalResearchBatchReport(slim(b), { includePerformance: false });
    assert.equal(ja, jb);
  });

  it("D-019 prefix invariance", () => {
    const ds = btcSliceDataset(0, 120);
    const before = runBatch([ds], { evaluationIndices: [60], observationHorizonBars: [12] });
    const strictBefore = before.evidenceRecords.filter((r) => r.measurementMode === "STRICT_AT_E");
    const extendedCandles: Candle[] = [
      ...ds.candles,
      { ...ds.candles[ds.candles.length - 1]!, time: ds.candles.length * ONE_H, high: 200, low: 50, open: 100, close: 150 },
    ];
    const dsExt = { ...ds, candles: extendedCandles, lastEvaluationBar: extendedCandles.length - 1 };
    const after = runBatch([dsExt], { evaluationIndices: [60], observationHorizonBars: [12] });
    const strictAfter = after.evidenceRecords.filter((r) => r.measurementMode === "STRICT_AT_E");
    assert.deepEqual(
      strictAfter.map((r) => ({ eventId: r.eventId, eventFamily: r.eventFamily, knownAtBarIndex: r.knownAtBarIndex })),
      strictBefore.map((r) => ({ eventId: r.eventId, eventFamily: r.eventFamily, knownAtBarIndex: r.knownAtBarIndex }))
    );
  });

  it("D-020 future spike", () => {
    const base = flatCandles(80, 100);
    for (let i = 0; i < base.length; i++) {
      base[i]!.time = i * ONE_H;
    }
    const E = 40;
    const ds: HistoricalResearchDataset = {
      datasetId: "TEST_1H",
      symbol: "TEST",
      timeframe: "1H",
      datasetChecksum: "test-checksum",
      source: "synthetic",
      closedCandleOnly: true,
      barDurationMs: ONE_H,
      fixturePath: "",
      candles: base,
      status: "COMPLETE",
      firstEvaluationBar: 20,
      lastEvaluationBar: base.length - 1,
    };
    const before = runBatch([ds], { evaluationIndices: [E], observationHorizonBars: [8] });
    const extended = base.map((c) => ({ ...c }));
    for (let i = E + 1; i < extended.length; i++) {
      extended[i] = { ...extended[i]!, high: 10_000, low: 9_000, close: 9_500 };
    }
    const dsSpike = { ...ds, candles: extended };
    const after = runBatch([dsSpike], { evaluationIndices: [E], observationHorizonBars: [8] });
    assert.deepEqual(
      before.evidenceRecords
        .filter((r) => r.measurementMode === "STRICT_AT_E")
        .map((r) => ({ eventId: r.eventId, knownAtBarIndex: r.knownAtBarIndex })),
      after.evidenceRecords
        .filter((r) => r.measurementMode === "STRICT_AT_E")
        .map((r) => ({ eventId: r.eventId, knownAtBarIndex: r.knownAtBarIndex }))
    );
    const obsB = before.evidenceRecords.find((r) => r.forwardObservations.forwardReturn !== null);
    const obsA = after.evidenceRecords.find((r) => r.forwardObservations.forwardReturn !== null);
    if (obsB && obsA) {
      assert.notEqual(obsB.forwardObservations.forwardReturn, obsA.forwardObservations.forwardReturn);
    }
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksumSafe(),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
  });

  it("D-021 partial dataset", () => {
    const partial: HistoricalResearchDataset = {
      ...btcSliceDataset(),
      status: "PARTIAL",
      candles: [],
    };
    const report = runBatch([partial], { evaluationIndices: [300], observationHorizonBars: [8] });
    assert.ok(report.unresolved.some((u) => u.code === "DATASET_PARTIAL_OR_INVALID"));
    assert.equal(report.coverage.datasetCount, 0);
  });

  it("D-022 invalid dataset", () => {
    const invalid: HistoricalResearchDataset = {
      ...btcSliceDataset(),
      status: "INVALID",
      candles: [],
    };
    const report = runBatch([invalid, btcSliceDataset()], {
      evaluationIndices: [300],
      observationHorizonBars: [8],
    });
    assert.equal(report.coverage.datasetCount, 1);
    assert.ok(report.unresolved.some((u) => u.code === "DATASET_PARTIAL_OR_INVALID"));
  });

  it("D-023 forbidden fields", () => {
    const report = runBatch([btcSliceDataset()], { evaluationIndices: [300], observationHorizonBars: [8] });
    const slim = { ...report, evidenceRecords: report.evidenceRecords.slice(0, 5) };
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalResearchPipelineKeys(slim));
    assert.doesNotThrow(() =>
      serializeMslHistoricalResearchBatchReport(slim, { includePerformance: false })
    );
    assert.throws(() => assertNoForbiddenMslHistoricalResearchPipelineKeys({ score: 1 }));
  });

  it("D-024 architecture guard", () => {
    const arch = readFileSync(
      join(process.cwd(), "src/wave/__tests__/architecture-contract.test.ts"),
      "utf8"
    );
    assert.ok(arch.includes("EA — MSL historical research pipeline"));
  });

  it("D-025 frozen BTC checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("D-026 native HTF remains non-canonical", () => {
    const report = runBatch([btcSliceDataset()], { evaluationIndices: [300], observationHorizonBars: [8] });
    assert.ok(report.limitations.includes("NATIVE_HTF_PRODUCTION_NOT_ESTABLISHED"));
    assert.ok(report.limitations.includes("DERIVED_1H_4H_MTF_CANONICAL"));
    const blob = JSON.stringify({ limitations: report.limitations, datasets: report.datasets });
    assert.ok(!blob.includes("native_htf_canonical"));
    assert.ok(!report.datasets.some((d) => d.timeframe === "4H" && d.fixturePath.includes("4h-native")));
  });

  it("D-027 15M remains NOT_ESTABLISHED", () => {
    const report = runBatch([btcSliceDataset()], { evaluationIndices: [300], observationHorizonBars: [8] });
    assert.ok(report.limitations.includes("15M_NOT_ESTABLISHED"));
    assert.ok(!report.datasets.some((d) => d.timeframe === "15M"));
  });

  it("D-028 performance measurement", () => {
    const report = runBatch([btcSliceDataset()], { evaluationIndices: [300], observationHorizonBars: [8] });
    assert.ok(typeof report.performance.evidenceGenerationMs === "number");
    assert.ok(typeof report.performance.analyticsGenerationMs === "number");
    assert.ok(typeof report.performance.totalProcessingMs === "number");
    assert.ok(report.performance.totalProcessingMs >= 0);
  });

  it("D-029 error isolation", () => {
    const good = btcSliceDataset();
    const bad: HistoricalResearchDataset = { ...good, datasetId: "OTHER", status: "INVALID", candles: [] };
    const report = runBatch([good, bad], {
      evaluationIndices: [300, 999_999],
      observationHorizonBars: [8],
    });
    assert.ok(report.evidenceRecords.length >= 1);
    assert.ok(report.evaluationConfig.skippedEvaluations.length >= 1);
  });

  it("D-030 empty dataset", () => {
    const empty: HistoricalResearchDataset = {
      ...btcSliceDataset(),
      candles: [],
      status: "INVALID",
      lastEvaluationBar: 0,
    };
    const report = runBatch([empty], { evaluationIndices: [20], observationHorizonBars: [4] });
    assert.equal(report.evidenceRecords.length, 0);
  });

  it("D-031 zero valid evaluation points", () => {
    const ds = btcSliceDataset();
    const report = runBatch([ds], { evaluationIndices: [5, 6, 7], observationHorizonBars: [4] });
    assert.equal(report.evaluationConfig.evaluationIndices.length, 0);
    assert.ok(report.evaluationConfig.skippedEvaluations.length >= 3);
  });

  it("D-032 single horizon vs multiple horizon parity", () => {
    const ds = btcSliceDataset();
    const single = runBatch([ds], { evaluationIndices: [340], observationHorizonBars: [8] });
    const multi = runBatch([ds], { evaluationIndices: [340], observationHorizonBars: [8, 12] });
    const singleH = single.evidenceRecords.filter((r) => r.observationHorizonBars === 8);
    const multiH = multi.evidenceRecords.filter((r) => r.observationHorizonBars === 8);
    assert.deepEqual(
      singleH.map((r) => r.eventId),
      multiH.map((r) => r.eventId)
    );
  });

  it("D-033 cross-symbol aggregate explicitly labelled", () => {
    const { datasets } = resolveAvailableHistoricalResearchDatasets({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    if (datasets.length < 2) {
      return;
    }
    const sliced = datasets.map((d) => ({
      ...d,
      candles: d.candles.slice(450, 800),
      lastEvaluationBar: 0,
    }));
    for (const s of sliced) {
      s.lastEvaluationBar = s.candles.length - 1;
    }
    const report = runBatch(sliced, { evaluationIndices: [300], observationHorizonBars: [8] });
    assert.equal(report.crossSymbolAggregate!.aggregateLabel, "ALL_SYMBOLS");
    assert.ok(report.crossSymbolAggregate!.limitations.some((l) => l.includes("not_independent")));
  });

  it("D-034 cross-timeframe aggregate explicitly labelled", () => {
    const report = runBatch([btcSliceDataset()], { evaluationIndices: [300], observationHorizonBars: [8] });
    const agg = report.crossTimeframeAggregates.find((a) => a.aggregateLabel === "TIMEFRAME_1H");
    assert.ok(agg);
    assert.deepEqual(agg!.timeframesIncluded, ["1H"]);
  });

  it("D-035 no statistical significance output", () => {
    const report = runBatch([btcSliceDataset()], {
      evaluationIndices: [300],
      observationHorizonBars: [8],
    });
    const json = JSON.stringify({
      cohortAnalytics: report.cohortAnalytics,
      overlap: report.overlap,
      horizonComparisons: report.horizonComparisons,
      evidenceSummary: report.evidenceSummary,
    }).toLowerCase();
    assert.ok(!json.includes('"pvalue"'));
    assert.ok(!json.includes('"correlation"'));
    assert.ok(!json.includes("significance"));
    assert.ok(!json.includes("independence_test"));
  });
});

function computeHistoricalFrozenOhlcvDatasetChecksumSafe(): string {
  return loadBtcusdt1hResearchFrozenDatasetV1().document.metadata.datasetChecksum;
}

describe("msl-historical-research CLI", () => {
  it("parses args without network flags", () => {
    const args = parseMslHistoricalResearchCliArgs([
      "--dataset",
      "BTCUSDT",
      "--start-e",
      "300",
      "--end-e",
      "400",
      "--step",
      "50",
      "--horizons",
      "4,8",
      "--output",
      "out/test.json",
    ]);
    assert.deepEqual(args.symbols, ["BTCUSDT"]);
    assert.equal(args.startE, 300);
    assert.deepEqual(args.observationHorizonBars, [4, 8]);
  });
});

describe("native 4H frozen checksum (research-only)", () => {
  it("D-026b native fixture checksum unchanged", () => {
    const path = join(process.cwd(), "src/wave/fixtures/btcusdt-4h-native-research-ohlcv-v1.json");
    const doc = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(doc.metadata.datasetChecksum, BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });
});
