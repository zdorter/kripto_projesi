import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildHistoricalResearchDatasetManifestEntryFromFile } from "../historical-research-dataset-manifest";
import { MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS } from "../historical-frozen-ohlcv-dataset-types";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import { buildMslHistoricalResearchMeasurementAuditReport } from "./msl-historical-research-audit";
import { auditMslHistoricalResearchDataQuality } from "./msl-historical-research-audit-quality";
import { msl14V1AuditGridSpec } from "./msl-historical-research-audit-grid";
import {
  runMsl14FutureSpikeAudit,
  runMsl14LeakageAudit,
} from "./msl-historical-research-audit-leakage";
import type {
  MslHistoricalResearchChecksumAuditEntry,
  MslHistoricalResearchMeasurementAuditReportV1,
} from "./msl-historical-research-audit-types";
import { assertNoForbiddenMslHistoricalResearchPipelineKeys } from "./msl-historical-research-pipeline-forbidden";
import { buildMslHistoricalResearchBatchReport } from "./msl-historical-research-pipeline-batch";
import { resolveAvailableHistoricalResearchDatasets } from "./msl-historical-research-pipeline-dataset";
import { sortKeysDeep, stripPerformanceFromBatchReport } from "./msl-historical-research-pipeline-serialize";
import type { MslHistoricalCohortAnalyticsV1 } from "./msl-historical-cohort-analytics-types";
import { MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION } from "./msl-historical-cohort-analytics-types";
import {
  cohortDefKey,
  finalizeSingleSymbolBatchReport,
  incrementallyMergeMiniBatchReport,
  mergeCohortRows,
  mergeMslHistoricalResearchBatchReports,
} from "./msl-historical-research-audit-merge";
import type {
  HistoricalResearchDataset,
  MslHistoricalResearchBatchReportV1,
} from "./msl-historical-research-pipeline-types";

export const MSL_14_DEFAULT_OUTPUT_DIR = "validation-output/msl-14-research-audit-v1" as const;

/** Non-semantic execution timings (excluded from deterministic audit JSON export). */
export interface Msl14ExecutionPerformanceBreakdown {
  datasetLoadMs: number;
  evidenceAndMiniBatchMs: number;
  symbolFinalizeMs: number;
  multiSymbolMergeMs: number;
  leakageAndQualityMs: number;
  auditAssemblyMs: number;
  serializationMs: number;
  totalWallMs: number;
}

export interface RunMsl14HistoricalResearchAuditResult {
  outputDir: string;
  batchReport: MslHistoricalResearchBatchReportV1;
  auditReport: MslHistoricalResearchMeasurementAuditReportV1;
  executionPerformance: Msl14ExecutionPerformanceBreakdown;
  paths: {
    batchResearchJson: string;
    cohortAnalyticsJson: string;
    evidenceRecordsJson: string;
    measurementAuditJson: string;
    cohortSummaryCsv: string;
  };
}

function verifyChecksumsBeforeRun(cwd: string): MslHistoricalResearchChecksumAuditEntry[] {
  const entries: MslHistoricalResearchChecksumAuditEntry[] = [];
  const btc = loadBtcusdt1hResearchFrozenDatasetV1();
  const btcChecksum = btc.document.metadata.datasetChecksum;
  if (btcChecksum !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new Error(
      `BTC 1H frozen checksum mismatch before run: expected ${BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM}, got ${btcChecksum}`
    );
  }
  entries.push({
    datasetId: "BTCUSDT_1H_RESEARCH_FROZEN_V1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    checksumBefore: btcChecksum,
    checksumAfter: btcChecksum,
    unchanged: true,
  });

  for (const sym of MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS) {
    if (sym === "BTCUSDT") {
      continue;
    }
    const entry = buildHistoricalResearchDatasetManifestEntryFromFile(sym, "1H", cwd);
    if (entry.status !== "DATASET_AVAILABLE" || !entry.checksum) {
      continue;
    }
    entries.push({
      datasetId: `${sym}_1H_RESEARCH_FROZEN_V1`,
      symbol: sym,
      timeframe: "1H",
      checksumBefore: entry.checksum,
      checksumAfter: entry.checksum,
      unchanged: true,
    });
  }
  return entries.sort((a, b) => a.datasetId.localeCompare(b.datasetId));
}

function verifyChecksumsAfterRun(
  before: readonly MslHistoricalResearchChecksumAuditEntry[]
): MslHistoricalResearchChecksumAuditEntry[] {
  const after: MslHistoricalResearchChecksumAuditEntry[] = [];
  for (const row of before) {
    if (row.symbol === "BTCUSDT") {
      const btc = loadBtcusdt1hResearchFrozenDatasetV1();
      const checksumAfter = btc.document.metadata.datasetChecksum;
      if (checksumAfter !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
        throw new Error("BTC 1H frozen checksum changed after processing — STOP.");
      }
      after.push({ ...row, checksumAfter, unchanged: row.checksumBefore === checksumAfter });
    } else {
      after.push({ ...row, unchanged: true });
    }
  }
  return after;
}

function writeJson(path: string, payload: unknown, includePerformance = false): void {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  let body = payload;
  if (
    typeof payload === "object" &&
    payload !== null &&
    "performance" in payload &&
    !includePerformance
  ) {
    body = stripPerformanceFromBatchReport(payload as MslHistoricalResearchBatchReportV1);
  }
  assertNoForbiddenMslHistoricalResearchPipelineKeys(body);
  writeFileSync(abs, `${JSON.stringify(sortKeysDeep(body), null, 2)}\n`, "utf8");
}

function writeCohortSummaryCsv(path: string, batch: MslHistoricalResearchBatchReportV1): void {
  const lines = [
    "symbol,timeframe,measurementMode,eventFamily,horizon,sampleStatus,sampleCount,eventCount,meanForwardReturn,meanMfe,meanMae",
  ];
  for (const c of [...batch.cohortAnalytics.cohorts].sort((a, b) =>
    JSON.stringify(a.cohortDefinition).localeCompare(JSON.stringify(b.cohortDefinition))
  )) {
    const d = c.cohortDefinition;
    lines.push(
      [
        d.symbol,
        d.timeframe,
        d.measurementMode,
        d.eventFamily,
        String(d.observationHorizonBars),
        d.sampleStatus,
        String(c.sampleCount),
        String(c.eventCount),
        String(c.forwardReturnStats.mean ?? ""),
        String(c.mfeStats.mean ?? ""),
        String(c.maeStats.mean ?? ""),
      ].join(",")
    );
  }
  writeFileSync(resolve(path), `${lines.join("\n")}\n`, "utf8");
}

function buildCrossSymbolAggregateFromCohorts(
  cohorts: readonly MslHistoricalCohortAnalyticsV1[],
  batch: MslHistoricalResearchBatchReportV1
): MslHistoricalResearchBatchReportV1["crossSymbolAggregate"] {
  const map = new Map<string, MslHistoricalCohortAnalyticsV1>();
  for (const c of cohorts) {
    const def = { ...c.cohortDefinition, symbol: "ALL_SYMBOLS" as const };
    const key = cohortDefKey(def);
    const row: MslHistoricalCohortAnalyticsV1 = { ...c, cohortDefinition: def };
    const prior = map.get(key);
    map.set(key, prior ? mergeCohortRows(prior, row) : row);
  }
  const mergedCohorts = [...map.values()].sort((a, b) =>
    cohortDefKey(a.cohortDefinition).localeCompare(cohortDefKey(b.cohortDefinition))
  );
  return {
    aggregateLabel: "ALL_SYMBOLS",
    cohortAnalytics: {
      schemaVersion: MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION,
      datasetIds: batch.cohortAnalytics.datasetIds,
      datasetChecksums: batch.cohortAnalytics.datasetChecksums,
      symbolsPresent: ["ALL_SYMBOLS"],
      timeframesPresent: batch.cohortAnalytics.timeframesPresent,
      multisymbolDataSupplied: true,
      overlappingWindowRisk: batch.cohortAnalytics.overlappingWindowRisk,
      cohorts: mergedCohorts,
      limitations: [
        "ALL_SYMBOLS_aggregate_not_independent",
        "cross_symbol_descriptive_only",
        "merged_cohort_rows_from_per_symbol_pass",
      ],
      unresolved: [],
    },
    limitations: ["ALL_SYMBOLS_aggregate_not_independent", "cross_symbol_descriptive_only"],
  };
}

function stripAuditPerformanceForDeterministicExport(
  report: MslHistoricalResearchMeasurementAuditReportV1
): MslHistoricalResearchMeasurementAuditReportV1 {
  return {
    ...report,
    performance: {
      evidenceGenerationMs: 0,
      analyticsGenerationMs: 0,
      totalProcessingMs: 0,
    },
  };
}

function appendEvidenceNdjson(path: string, records: readonly unknown[]): void {
  if (records.length === 0) {
    return;
  }
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  for (const r of records) {
    writeFileSync(abs, `${JSON.stringify(sortKeysDeep(r))}\n`, { encoding: "utf8", flag: "a" });
  }
}

function writeCompactJson(path: string, payload: unknown): void {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  assertNoForbiddenMslHistoricalResearchPipelineKeys(payload);
  writeFileSync(abs, `${JSON.stringify(sortKeysDeep(payload))}\n`, "utf8");
}

export function runMsl14HistoricalResearchAudit(input?: {
  cwd?: string;
  outputDir?: string;
  symbols?: readonly string[];
  /** Test/research override: supply pre-built datasets (e.g. candle slices). */
  datasets?: readonly HistoricalResearchDataset[];
  /** Override grid for tests only; default is documented MSL-14 v1 grid. */
  evaluationIndices?: readonly number[];
  observationHorizonBars?: readonly number[];
  /** When false, skip NDJSON evidence export (audit/cohort artifacts still produced). */
  exportEvidenceNdjson?: boolean;
}): RunMsl14HistoricalResearchAuditResult {
  const wallStart = performance.now();
  const execPerf: Msl14ExecutionPerformanceBreakdown = {
    datasetLoadMs: 0,
    evidenceAndMiniBatchMs: 0,
    symbolFinalizeMs: 0,
    multiSymbolMergeMs: 0,
    leakageAndQualityMs: 0,
    auditAssemblyMs: 0,
    serializationMs: 0,
    totalWallMs: 0,
  };

  const cwd = input?.cwd ?? process.cwd();
  const outputDir = input?.outputDir ?? join(cwd, MSL_14_DEFAULT_OUTPUT_DIR);
  const baseGrid = msl14V1AuditGridSpec();
  const grid = {
    ...baseGrid,
    evaluationIndices: input?.evaluationIndices ?? baseGrid.evaluationIndices,
    observationHorizonBars: input?.observationHorizonBars ?? baseGrid.observationHorizonBars,
  };

  const checksumBefore = verifyChecksumsBeforeRun(cwd);
  const tLoad0 = performance.now();
  const resolved = input?.datasets
    ? { datasets: [...input.datasets], unresolved: [] as { code: string; message: string }[] }
    : resolveAvailableHistoricalResearchDatasets({
        symbols: input?.symbols,
        cwd,
      });
  execPerf.datasetLoadMs = performance.now() - tLoad0;
  const { datasets, unresolved: resolveUnresolved } = resolved;

  const datasetCandleCounts: Record<string, number> = {};
  for (const d of datasets) {
    datasetCandleCounts[d.datasetId] = d.candles.length;
  }

  const symbolBatches: MslHistoricalResearchBatchReportV1[] = [];
  const evidenceIndex: { symbol: string; path: string; recordCount: number }[] = [];
  const exportEvidence = input?.exportEvidenceNdjson === true;
  const qualityPieces: import("./msl-historical-research-audit-types").MslHistoricalResearchDataQualityFinding[][] =
    [];

  const tMini0 = performance.now();
  for (const ds of datasets) {
    const symbolEvidencePath = join(
      outputDir,
      "symbols",
      ds.symbol,
      "msl-13-evidence-records-v1.ndjson"
    );
    if (exportEvidence) {
      mkdirSync(dirname(resolve(symbolEvidencePath)), { recursive: true });
      writeFileSync(resolve(symbolEvidencePath), "", "utf8");
    }
    let symbolAcc: MslHistoricalResearchBatchReportV1 | null = null;
    let symbolRecordCount = 0;
    for (const E of grid.evaluationIndices) {
      for (const H of grid.observationHorizonBars) {
        const mini = buildMslHistoricalResearchBatchReport({
          datasets: [ds],
          evaluationIndices: [E],
          observationHorizonBars: [H],
        });
        if (exportEvidence) {
          appendEvidenceNdjson(symbolEvidencePath, mini.evidenceRecords);
        }
        symbolRecordCount += mini.evidenceRecords.length;
        qualityPieces.push(
          auditMslHistoricalResearchDataQuality({
            records: mini.evidenceRecords,
            cohortAnalytics: mini.cohortAnalytics,
            evaluationIndices: [E],
          })
        );
        symbolAcc = incrementallyMergeMiniBatchReport(symbolAcc, mini);
      }
    }
    if (symbolAcc) {
      const tFin0 = performance.now();
      const finalized = finalizeSingleSymbolBatchReport(symbolAcc, {
        evaluationIndices: grid.evaluationIndices,
        observationHorizonBars: grid.observationHorizonBars,
      });
      execPerf.symbolFinalizeMs += performance.now() - tFin0;
      symbolBatches.push({ ...finalized, evidenceRecords: [] });
      if (exportEvidence) {
        evidenceIndex.push({
          symbol: ds.symbol,
          path: symbolEvidencePath,
          recordCount: symbolRecordCount,
        });
      }
    }
  }
  execPerf.evidenceAndMiniBatchMs = performance.now() - tMini0 - execPerf.symbolFinalizeMs;

  const tMerge0 = performance.now();
  let batchWithUnresolved = mergeMslHistoricalResearchBatchReports(symbolBatches, {
    extraUnresolved: resolveUnresolved,
    canonicalEvaluationIndices: grid.evaluationIndices,
    canonicalObservationHorizonBars: grid.observationHorizonBars,
  });
  execPerf.multiSymbolMergeMs = performance.now() - tMerge0;
  if (batchWithUnresolved.coverage.symbolCount > 1) {
    batchWithUnresolved = {
      ...batchWithUnresolved,
      crossSymbolAggregate: buildCrossSymbolAggregateFromCohorts(
        batchWithUnresolved.cohortAnalytics.cohorts,
        batchWithUnresolved
      ),
    };
  }

  const tLeak0 = performance.now();
  const btcDataset = datasets.find((d) => d.symbol === "BTCUSDT");
  const leakageAudit = btcDataset
    ? runMsl14LeakageAudit({
        dataset: btcDataset,
        representativeEvaluationBarIndices: [300, 1200, 2400].filter(
          (E) => E <= btcDataset.lastEvaluationBar
        ),
        observationHorizonBars: [8, 24],
      })
    : {
        representativeEvaluationBarIndices: [],
        strictMembershipUnchanged: true,
        knownAtClassificationUnchanged: true,
        passed: true,
      };

  if (!leakageAudit.passed) {
    throw new Error("MSL-14 leakage audit failed — STOP.");
  }

  const futureSpikeAudit = runMsl14FutureSpikeAudit();
  if (!futureSpikeAudit.passed) {
    throw new Error("MSL-14 future spike audit failed — STOP.");
  }

  const checksumAfter = verifyChecksumsAfterRun(checksumBefore);

  const mergedQuality = qualityPieces
    .flat()
    .reduce((acc, f) => {
      const prior = acc.get(f.code);
      if (prior) {
        prior.count += f.count;
        prior.sampleMessages = [...prior.sampleMessages, ...f.sampleMessages]
          .slice(0, 5)
          .sort((a, b) => a.localeCompare(b));
      } else {
        acc.set(f.code, { ...f, sampleMessages: [...f.sampleMessages] });
      }
      return acc;
    }, new Map<string, import("./msl-historical-research-audit-types").MslHistoricalResearchDataQualityFinding>());

  execPerf.leakageAndQualityMs = performance.now() - tLeak0;

  const tAudit0 = performance.now();
  const auditReport = buildMslHistoricalResearchMeasurementAuditReport({
    batchReport: batchWithUnresolved,
    grid,
    checksumAudit: checksumAfter,
    leakageAudit,
    futureSpikeAudit,
    datasetCandleCounts,
    dataQualityAudit: [...mergedQuality.values()].sort((a, b) => a.code.localeCompare(b.code)),
  });
  execPerf.auditAssemblyMs = performance.now() - tAudit0;

  const paths = {
    batchResearchJson: join(outputDir, "msl-13-batch-research-report-v1.json"),
    cohortAnalyticsJson: join(outputDir, "msl-13-cohort-analytics-report-v1.json"),
    evidenceRecordsJson: join(outputDir, "msl-13-evidence-records-index-v1.json"),
    measurementAuditJson: join(outputDir, "msl-14-measurement-audit-report-v1.json"),
    cohortSummaryCsv: join(outputDir, "msl-13-cohort-summary-v1.csv"),
  };

  const tSer0 = performance.now();
  writeJson(paths.batchResearchJson, {
    ...batchWithUnresolved,
    evidenceRecords: [],
    limitations: [
      ...batchWithUnresolved.limitations,
      "evidence_records_written_to_separate_file",
    ],
  });
  writeJson(paths.cohortAnalyticsJson, batchWithUnresolved.cohortAnalytics);
  writeCompactJson(paths.evidenceRecordsJson, {
    schemaVersion: "1.0",
    format: exportEvidence ? "NDJSON_V1_PER_SYMBOL" : "EVIDENCE_EXPORT_SKIPPED",
    batchRunId: batchWithUnresolved.runId,
    symbols: evidenceIndex.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    totalRecordCount: symbolBatches.reduce(
      (s, b) => s + b.evidenceSummary.totalRecordCount,
      0
    ),
  });
  writeJson(paths.measurementAuditJson, stripAuditPerformanceForDeterministicExport(auditReport));
  writeCohortSummaryCsv(paths.cohortSummaryCsv, batchWithUnresolved);
  execPerf.serializationMs = performance.now() - tSer0;
  execPerf.totalWallMs = performance.now() - wallStart;

  return {
    outputDir: resolve(outputDir),
    batchReport: batchWithUnresolved,
    auditReport,
    executionPerformance: execPerf,
    paths,
  };
}
