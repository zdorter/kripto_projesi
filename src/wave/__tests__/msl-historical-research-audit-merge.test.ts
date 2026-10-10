import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HistoricalFrozenOhlcvDatasetError } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import {
  computeOverlapForCanonicalGrid,
  dedupeHistoricalResearchDatasetMetas,
  filterMultisymbolUnresolvedItems,
  mergeMslHistoricalResearchBatchReports,
  MULTISYMBOL_DATA_NOT_SUPPLIED_CODE,
} from "../msl-historical-evidence/msl-historical-research-audit-merge";
import { runMsl14HistoricalResearchAudit } from "../msl-historical-evidence/msl-historical-research-audit-run";
import { buildMslHistoricalResearchBatchReport } from "../msl-historical-evidence/msl-historical-research-pipeline-batch";
import { resolveAvailableHistoricalResearchDatasets } from "../msl-historical-evidence/msl-historical-research-pipeline-dataset";
import type { HistoricalResearchDatasetMeta } from "../msl-historical-evidence/msl-historical-research-pipeline-types";

function btcMeta(checksum: string): HistoricalResearchDatasetMeta {
  return {
    datasetId: "BTCUSDT_1H_RESEARCH_FROZEN_V1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    datasetChecksum: checksum,
    source: "fixture",
    closedCandleOnly: true,
    barDurationMs: 3_600_000,
    fixturePath: "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json",
    status: "COMPLETE",
    firstEvaluationBar: 150,
    lastEvaluationBar: 2999,
  };
}

describe("MSL-14 merge / execution aggregation (PERF-MERGE)", () => {
  it("PERF-MERGE-001: 15 minis → one dataset inventory row", () => {
    const { batchReport } = runMsl14HistoricalResearchAudit({
      symbols: ["BTCUSDT"],
      evaluationIndices: [150, 450, 750],
      observationHorizonBars: [4, 8, 12, 24, 48],
      exportEvidenceNdjson: false,
      outputDir: join(process.cwd(), "validation-output/msl-14-perf-merge-001"),
    });
    assert.equal(batchReport.datasets.length, 1);
    assert.equal(batchReport.datasets[0]!.datasetId, "BTCUSDT_1H_RESEARCH_FROZEN_V1");
    assert.equal(batchReport.coverage.perDataset.length, 1);
  });

  it("PERF-MERGE-002: datasetId checksum conflict fails fast", () => {
    const a = btcMeta("aaa");
    const b = btcMeta("bbb");
    assert.throws(
      () => dedupeHistoricalResearchDatasetMetas([a, b]),
      (err: unknown) => {
        assert.ok(err instanceof HistoricalFrozenOhlcvDatasetError);
        assert.match(String(err), /DATASET_CHECKSUM_CONFLICT/);
        return true;
      }
    );
  });

  it("PERF-MERGE-003: multisymbol merge drops MULTISYMBOL_DATA_NOT_SUPPLIED", () => {
    const { batchReport } = runMsl14HistoricalResearchAudit({
      evaluationIndices: [450],
      observationHorizonBars: [12],
      exportEvidenceNdjson: false,
      symbols: ["BTCUSDT", "ETHUSDT"],
      outputDir: join(process.cwd(), "validation-output/msl-14-perf-merge-003"),
    });
    const { datasets } = resolveAvailableHistoricalResearchDatasets({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    if (datasets.length < 2) {
      return;
    }
    assert.ok(batchReport.coverage.symbolCount > 1);
    assert.ok(
      !batchReport.unresolved.some((u) => u.code === MULTISYMBOL_DATA_NOT_SUPPLIED_CODE)
    );
    assert.ok(
      !batchReport.cohortAnalytics.unresolved.some(
        (u) => u.code === MULTISYMBOL_DATA_NOT_SUPPLIED_CODE
      )
    );
  });

  it("PERF-MERGE-004: single-symbol retains MULTISYMBOL limitation", () => {
    const { batchReport } = runMsl14HistoricalResearchAudit({
      symbols: ["BTCUSDT"],
      evaluationIndices: [450],
      observationHorizonBars: [8],
      exportEvidenceNdjson: false,
      outputDir: join(process.cwd(), "validation-output/msl-14-perf-merge-004"),
    });
    assert.equal(batchReport.coverage.symbolCount, 1);
    assert.ok(
      batchReport.unresolved.some((u) => u.code === MULTISYMBOL_DATA_NOT_SUPPLIED_CODE)
    );
  });

  it("PERF-MERGE-005: overlap deterministic from canonical E grid", () => {
    const meta = btcMeta(BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    const E = [150, 170, 190] as const;
    const H = [24, 48] as const;
    const a = computeOverlapForCanonicalGrid({
      datasets: [meta],
      evaluationIndices: E,
      observationHorizonBars: H,
    });
    const b = computeOverlapForCanonicalGrid({
      datasets: [meta],
      evaluationIndices: E,
      observationHorizonBars: H,
    });
    assert.deepEqual(a, b);
    assert.ok(a.evaluationPairCount > 0);
    assert.ok(a.overlappingPairCount > 0);
    assert.equal(a.overlapDependencyRisk, true);
  });

  it("PERF-MERGE-006: identical serialized audit export", () => {
    const opts = {
      symbols: ["BTCUSDT"] as const,
      evaluationIndices: [150, 450],
      observationHorizonBars: [4, 8] as const,
      exportEvidenceNdjson: false,
    };
    const outA = join(process.cwd(), "validation-output/msl-14-perf-merge-006a");
    const outB = join(process.cwd(), "validation-output/msl-14-perf-merge-006b");
    runMsl14HistoricalResearchAudit({ ...opts, outputDir: outA });
    runMsl14HistoricalResearchAudit({ ...opts, outputDir: outB });
    const auditA = readFileSync(join(outA, "msl-14-measurement-audit-report-v1.json"), "utf8");
    const auditB = readFileSync(join(outB, "msl-14-measurement-audit-report-v1.json"), "utf8");
    assert.equal(auditA, auditB);
  });

  it("PERF-MERGE-007: evidence summary counts stable on medium BTC grid", () => {
    const { batchReport } = runMsl14HistoricalResearchAudit({
      symbols: ["BTCUSDT"],
      evaluationIndices: [150, 450, 750],
      observationHorizonBars: [4, 8, 12, 24, 48],
      exportEvidenceNdjson: false,
      outputDir: join(process.cwd(), "validation-output/msl-14-perf-merge-007"),
    });
    assert.equal(batchReport.evidenceSummary.totalRecordCount, 39_920);
    assert.ok(batchReport.cohortAnalytics.cohorts.length > 0);
  });

  it("PERF-MERGE-008: frozen BTC checksum unchanged", () => {
    runMsl14HistoricalResearchAudit({
      symbols: ["BTCUSDT"],
      evaluationIndices: [150],
      observationHorizonBars: [4],
      exportEvidenceNdjson: false,
      outputDir: join(process.cwd(), "validation-output/msl-14-perf-merge-008"),
    });
    const { datasets } = resolveAvailableHistoricalResearchDatasets({ symbols: ["BTCUSDT"] });
    assert.equal(datasets[0]!.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("filterMultisymbolUnresolvedItems presentation-only", () => {
    const rows = [
      { code: MULTISYMBOL_DATA_NOT_SUPPLIED_CODE, message: "x" },
      { code: "OTHER", message: "y" },
    ];
    assert.equal(filterMultisymbolUnresolvedItems(rows, 2).length, 1);
    assert.equal(filterMultisymbolUnresolvedItems(rows, 1).length, 2);
  });

  it("mergeMslHistoricalResearchBatchReports dedupes duplicate symbol batches", () => {
    const { datasets } = resolveAvailableHistoricalResearchDatasets({ symbols: ["BTCUSDT"] });
    const mini = buildMslHistoricalResearchBatchReport({
      datasets,
      evaluationIndices: [150],
      observationHorizonBars: [4],
    });
    const merged = mergeMslHistoricalResearchBatchReports([mini, mini], {
      canonicalEvaluationIndices: [150],
      canonicalObservationHorizonBars: [4],
    });
    assert.equal(merged.datasets.length, 1);
    assert.equal(merged.evidenceSummary.totalRecordCount, mini.evidenceSummary.totalRecordCount * 2);
  });
});
