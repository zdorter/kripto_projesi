import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HistoricalFrozenOhlcvDatasetError } from "../historical-frozen-ohlcv-dataset";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import {
  buildMslHistoricalResearchMeasurementAuditReport,
  deterministicAuditRunId,
} from "../msl-historical-evidence/msl-historical-research-audit";
import {
  runMsl14FutureSpikeAudit,
  runMsl14LeakageAudit,
} from "../msl-historical-evidence/msl-historical-research-audit-leakage";
import { msl14V1AuditGridSpec } from "../msl-historical-evidence/msl-historical-research-audit-grid";
import { auditMslHistoricalResearchDataQuality } from "../msl-historical-evidence/msl-historical-research-audit-quality";
import { runMsl14HistoricalResearchAudit } from "../msl-historical-evidence/msl-historical-research-audit-run";
import { assertNoForbiddenMslHistoricalResearchPipelineKeys } from "../msl-historical-evidence/msl-historical-research-pipeline-forbidden";
import { buildMslHistoricalResearchBatchReport } from "../msl-historical-evidence/msl-historical-research-pipeline-batch";
import {
  defaultMinEvaluationBarIndex,
  researchDatasetId,
} from "../msl-historical-evidence/msl-historical-research-pipeline-dataset";
import { serializeMslHistoricalResearchBatchReport, sortKeysDeep } from "../msl-historical-evidence/msl-historical-research-pipeline-serialize";
import type { HistoricalResearchDataset } from "../msl-historical-evidence/msl-historical-research-pipeline-types";

const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const TEST_GRID_E = [300, 450];
const TEST_GRID_H = [4, 8];

function btcSlice(from = 400, to = 900): HistoricalResearchDataset {
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  const candles = loaded.candles.slice(from, to);
  const m = loaded.document.metadata;
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
    lastEvaluationBar: candles.length - 1,
  };
}

function buildFixtureAudit() {
  const ds = btcSlice();
  const batch = buildMslHistoricalResearchBatchReport({
    datasets: [ds],
    evaluationIndices: TEST_GRID_E,
    observationHorizonBars: TEST_GRID_H,
    swingConfig: SWING,
  });
  const grid = {
    ...msl14V1AuditGridSpec(),
    evaluationIndices: TEST_GRID_E,
    observationHorizonBars: TEST_GRID_H,
  };
  const leakage = runMsl14LeakageAudit({
    dataset: ds,
    representativeEvaluationBarIndices: [300],
    observationHorizonBars: [8],
  });
  const spike = runMsl14FutureSpikeAudit();
  const audit = buildMslHistoricalResearchMeasurementAuditReport({
    batchReport: batch,
    grid,
    checksumAudit: [
      {
        datasetId: ds.datasetId,
        symbol: "BTCUSDT",
        timeframe: "1H",
        checksumBefore: BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
        checksumAfter: BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
        unchanged: true,
      },
    ],
    leakageAudit: leakage,
    futureSpikeAudit: spike,
    datasetCandleCounts: { [ds.datasetId]: ds.candles.length },
  });
  return { batch, audit, ds, grid, leakage, spike };
}

describe("MSL-14 historical research measurement audit", () => {
  it("A-001 checksum verification", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    const { audit } = buildFixtureAudit();
    assert.ok(audit.checksumAudit.every((c) => c.unchanged));
  });

  it("A-002 strict/disclosure/observation separation", () => {
    const { audit } = buildFixtureAudit();
    const modes = audit.measurementModeAudit.map((m) => m.measurementMode);
    assert.deepEqual(modes, ["STRICT_AT_E", "DISCLOSURE_HORIZON", "OBSERVATION_ONLY"]);
    for (const m of audit.measurementModeAudit) {
      assert.ok(m.cohortRowCount >= 0);
    }
  });

  it("A-003 event-family inventory", () => {
    const { audit } = buildFixtureAudit();
    assert.ok(audit.eventInventory.BOS >= 0);
    assert.ok(typeof audit.eventInventory.SWEEP === "number");
    assert.ok(typeof audit.associationInventory.LIQUIDITY_TO_BOS === "number");
  });

  it("A-004 forward metric distribution", () => {
    const { audit } = buildFixtureAudit();
    assert.ok(audit.forwardMetricAudit.length >= 1);
    const row = audit.forwardMetricAudit[0]!;
    assert.ok("p25" in row.forwardReturnStats);
    assert.ok("median" in row.mfeStats);
  });

  it("A-005 time-to-event audit", () => {
    const { audit } = buildFixtureAudit();
    assert.ok(audit.timeToEventAudit.some((t) => t.eventFamily === "BOS"));
  });

  it("A-006 horizon comparison", () => {
    const { audit } = buildFixtureAudit();
    assert.equal(audit.horizonComparison.length, TEST_GRID_H.length);
  });

  it("A-007 co-occurrence audit", () => {
    const { audit } = buildFixtureAudit();
    for (const row of audit.coOccurrenceAudit) {
      assert.ok(row.observedCoOccurrenceKey.includes("+") || row.count >= 0);
    }
  });

  it("A-008 overlap detection", () => {
    const { audit } = buildFixtureAudit();
    assert.equal(audit.overlapDependencyAudit.overlapDependencyRiskLabel, "overlap_dependency_risk");
    assert.ok(audit.overlapDependencyAudit.notStatisticallyIndependentNote.includes("not statistically independent"));
  });

  it("A-009 duplicate evaluation detection", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    const dup = quality.find((f) => f.code === "DUPLICATE_EVALUATION_INDEX_IN_GRID");
    assert.ok(dup);
    assert.equal(dup!.count, 0);
  });

  it("A-010 duplicate event detection", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    assert.ok(quality.find((f) => f.code === "DUPLICATE_EVENT_ID"));
  });

  it("A-011 strict known-at violation detection", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    const row = quality.find((f) => f.code === "STRICT_KNOWN_AT_VIOLATION");
    assert.ok(row);
    assert.equal(row!.count, 0);
  });

  it("A-012 disclosure known-at violation detection", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    const row = quality.find((f) => f.code === "DISCLOSURE_KNOWN_AT_VIOLATION");
    assert.ok(row);
    assert.equal(row!.count, 0);
  });

  it("A-013 out-of-horizon event detection", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    assert.ok(quality.find((f) => f.code === "EVENT_OUTSIDE_HORIZON"));
  });

  it("A-014 insufficient-horizon exclusion", () => {
    const { audit, batch } = buildFixtureAudit();
    const insufficientSlices = batch.cohortAnalytics.cohorts.filter(
      (c) => c.cohortDefinition.sampleStatus === "INSUFFICIENT_HORIZON"
    );
    for (const c of insufficientSlices) {
      assert.ok(
        !audit.forwardMetricAudit.some(
          (s) =>
            s.eventFamily === c.cohortDefinition.eventFamily &&
            s.measurementMode === c.cohortDefinition.measurementMode &&
            s.observationHorizonBars === c.cohortDefinition.observationHorizonBars
        ) || c.sampleCount === 0
      );
    }
  });

  it("A-015 null-not-zero validation", () => {
    const { batch, grid } = buildFixtureAudit();
    const quality = auditMslHistoricalResearchDataQuality({
      records: batch.evidenceRecords,
      cohortAnalytics: batch.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });
    const row = quality.find((f) => f.code === "NULL_TREATED_AS_ZERO");
    assert.ok(row);
    assert.equal(row!.count, 0);
  });

  it("A-016 prefix invariance", () => {
    const { leakage } = buildFixtureAudit();
    assert.ok(leakage.passed);
    assert.ok(leakage.strictMembershipUnchanged);
  });

  it("A-017 future spike", () => {
    const spike = runMsl14FutureSpikeAudit();
    assert.ok(spike.passed);
    assert.ok(spike.strictMembershipUnchanged);
    assert.ok(spike.frozenBtcChecksumUnchanged);
  });

  it("A-018 deterministic JSON", () => {
    const a = buildFixtureAudit().audit;
    const b = buildFixtureAudit().audit;
    const ja = JSON.stringify(sortKeysDeep({ ...a, performance: { evidenceGenerationMs: 0, analyticsGenerationMs: 0, totalProcessingMs: 0 } }));
    const jb = JSON.stringify(sortKeysDeep({ ...b, performance: { evidenceGenerationMs: 0, analyticsGenerationMs: 0, totalProcessingMs: 0 } }));
    assert.equal(ja, jb);
    assert.equal(a.auditRunId, deterministicAuditRunId(a.batchRunId, a.grid.gridId));
  });

  it("A-019 forbidden fields", () => {
    const { audit } = buildFixtureAudit();
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalResearchPipelineKeys(audit));
  });

  it("A-020 native HTF non-canonical", () => {
    const { audit } = buildFixtureAudit();
    assert.equal(audit.mtfStatus.nativeHtfProduction, "NOT_ESTABLISHED");
    assert.ok(audit.limitations.includes("NATIVE_HTF_PRODUCTION_NOT_ESTABLISHED"));
  });

  it("A-021 15M NOT_ESTABLISHED", () => {
    const { audit } = buildFixtureAudit();
    assert.equal(audit.mtfStatus.fifteenMinute, "NOT_ESTABLISHED");
  });

  it("A-022 multisymbol absence handling", () => {
    const { audit } = buildFixtureAudit();
    assert.equal(audit.multisymbolStatus.symbolCount, 1);
    assert.equal(audit.multisymbolStatus.multisymbolDataSupplied, false);
  });

  it("A-023 checksum conflict", () => {
    const ds = btcSlice();
    const dup = { ...ds, datasetChecksum: "0".repeat(64) };
    assert.throws(
      () =>
        buildMslHistoricalResearchBatchReport({
          datasets: [ds, dup],
          evaluationIndices: [300],
          observationHorizonBars: [8],
        }),
      (e: unknown) =>
        e instanceof HistoricalFrozenOhlcvDatasetError &&
        String((e as Error).message).includes("DATASET_CHECKSUM_CONFLICT")
    );
  });

  it("A-024 performance metadata", () => {
    const { audit } = buildFixtureAudit();
    assert.ok(typeof audit.performance.totalProcessingMs === "number");
  });

  it("A-025 empty result handling", () => {
    const empty: HistoricalResearchDataset = {
      ...btcSlice(),
      candles: [],
      status: "INVALID",
      lastEvaluationBar: 0,
    };
    const batch = buildMslHistoricalResearchBatchReport({
      datasets: [empty],
      evaluationIndices: [300],
      observationHorizonBars: [8],
    });
    const audit = buildMslHistoricalResearchMeasurementAuditReport({
      batchReport: batch,
      grid: { ...msl14V1AuditGridSpec(), evaluationIndices: [300], observationHorizonBars: [8] },
      checksumAudit: [],
      leakageAudit: {
        representativeEvaluationBarIndices: [],
        strictMembershipUnchanged: true,
        knownAtClassificationUnchanged: true,
        passed: true,
      },
      futureSpikeAudit: runMsl14FutureSpikeAudit(),
      datasetCandleCounts: {},
    });
    assert.equal(batch.evidenceRecords.length, 0);
    assert.ok(audit.dataQualityAudit.length >= 1);
  });
});

describe("MSL-14 audit run integration", () => {
  it("writes deterministic artifacts for documented mini grid", () => {
    const result = runMsl14HistoricalResearchAudit({
      datasets: [btcSlice(400, 750)],
      evaluationIndices: [350, 500],
      observationHorizonBars: [4, 8],
      exportEvidenceNdjson: true,
      outputDir: join(process.cwd(), "validation-output/msl-14-test-mini"),
    });
    assert.ok(readFileSync(result.paths.measurementAuditJson, "utf8").includes("MSL-14-V1"));
    const repeat = runMsl14HistoricalResearchAudit({
      datasets: [btcSlice(400, 750)],
      evaluationIndices: [350, 500],
      observationHorizonBars: [4, 8],
      exportEvidenceNdjson: true,
      outputDir: join(process.cwd(), "validation-output/msl-14-test-mini-2"),
    });
    assert.equal(result.batchReport.runId, repeat.batchReport.runId);
    assert.equal(result.auditReport.auditRunId, repeat.auditReport.auditRunId);
  });
});

describe("MSL-14 architecture guard reference", () => {
  it("EB guard present", () => {
    const arch = readFileSync(join(process.cwd(), "src/wave/__tests__/architecture-contract.test.ts"), "utf8");
    assert.ok(arch.includes("EB — MSL historical research measurement audit"));
  });
});
