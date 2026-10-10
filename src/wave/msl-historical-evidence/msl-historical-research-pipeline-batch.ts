import { HistoricalFrozenOhlcvDatasetError } from "../historical-frozen-ohlcv-dataset";
import { buildMslHistoricalEvidenceAtEvaluation } from "./msl-historical-evidence-batch";
import { buildMslHistoricalCohortAnalyticsReport } from "./msl-historical-cohort-analytics";
import { MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1 } from "./msl-historical-evidence-types";
import type { MslHistoricalEvidenceRecordV1 } from "./msl-historical-evidence-types";
import { defaultMinEvaluationBarIndex } from "./msl-historical-research-pipeline-dataset";
import { deterministicRunIdFromConfig } from "./msl-historical-research-pipeline-serialize";
import type {
  BuildMslHistoricalResearchBatchReportInput,
  HistoricalResearchDataset,
  HistoricalResearchDatasetMeta,
  MslHistoricalResearchBatchReportV1,
  MslHistoricalResearchEvaluationConfig,
  MslHistoricalResearchEvidenceSummary,
  MslHistoricalResearchHorizonComparisonRow,
  MslHistoricalResearchOverlapReport,
  MslHistoricalResearchSkippedEvaluation,
} from "./msl-historical-research-pipeline-types";
import { MSL_HISTORICAL_RESEARCH_BATCH_REPORT_SCHEMA_VERSION } from "./msl-historical-research-pipeline-types";

const DEFAULT_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function resolveEvaluationIndices(input: {
  dataset: HistoricalResearchDataset;
  evaluationIndices?: readonly number[];
  startE?: number;
  endE?: number;
  step?: number;
  minE: number;
}): { indices: number[]; skipped: MslHistoricalResearchSkippedEvaluation[] } {
  const skipped: MslHistoricalResearchSkippedEvaluation[] = [];
  let raw: number[] = [];

  if (input.evaluationIndices && input.evaluationIndices.length > 0) {
    raw = [...input.evaluationIndices];
  } else if (
    input.startE !== undefined &&
    input.endE !== undefined &&
    input.step !== undefined
  ) {
    const step = input.step;
    if (step <= 0 || !Number.isInteger(step)) {
      skipped.push({
        datasetId: input.dataset.datasetId,
        evaluationBarIndex: input.startE,
        code: "INVALID_STEP",
        message: `step must be a positive integer; got ${String(input.step)}`,
      });
      return { indices: [], skipped };
    }
    for (let e = input.startE; e <= input.endE; e += step) {
      raw.push(e);
    }
  } else {
    skipped.push({
      datasetId: input.dataset.datasetId,
      evaluationBarIndex: -1,
      code: "MISSING_EVALUATION_CONFIG",
      message: "Provide evaluationIndices or startE/endE/step.",
    });
    return { indices: [], skipped };
  }

  const indices: number[] = [];
  const seen = new Set<number>();
  for (const e of raw.sort((a, b) => a - b)) {
    if (seen.has(e)) {
      continue;
    }
    seen.add(e);
    if (!Number.isInteger(e) || e < input.minE || e > input.dataset.lastEvaluationBar) {
      skipped.push({
        datasetId: input.dataset.datasetId,
        evaluationBarIndex: e,
        code: "INVALID_EVALUATION_BAR_INDEX",
        message: `E=${e} outside valid range [${input.minE}, ${input.dataset.lastEvaluationBar}].`,
      });
      continue;
    }
    indices.push(e);
  }
  return { indices, skipped };
}

function buildEvidenceSummary(
  records: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalResearchEvidenceSummary {
  let strictRecordCount = 0;
  let disclosureRecordCount = 0;
  let observationOnlyRecordCount = 0;
  const eventFamilyCounts: Record<string, number> = {};

  for (const r of records) {
    if (r.measurementMode === "STRICT_AT_E") {
      strictRecordCount += 1;
    } else if (r.measurementMode === "DISCLOSURE_HORIZON") {
      disclosureRecordCount += 1;
    } else {
      observationOnlyRecordCount += 1;
    }
    const fam = r.eventFamily;
    eventFamilyCounts[fam] = (eventFamilyCounts[fam] ?? 0) + 1;
  }

  const sortedFamilies = Object.fromEntries(
    Object.entries(eventFamilyCounts).sort(([a], [b]) => a.localeCompare(b))
  );

  return {
    totalRecordCount: records.length,
    strictRecordCount,
    disclosureRecordCount,
    observationOnlyRecordCount,
    eventFamilyCounts: sortedFamilies,
  };
}

export function buildOverlapReport(
  datasets: readonly Pick<HistoricalResearchDataset, "datasetId">[],
  evaluationsByDataset: ReadonlyMap<string, readonly number[]>,
  horizons: readonly number[]
): MslHistoricalResearchOverlapReport {
  let evaluationPairCount = 0;
  let overlappingPairCount = 0;
  let sameDatasetOverlapCount = 0;
  let sameSymbolOverlapCount = 0;
  let sameTimeframeOverlapCount = 0;
  const labels: string[] = [];

  for (const ds of datasets) {
    const indices = [...(evaluationsByDataset.get(ds.datasetId) ?? [])].sort(
      (a, b) => a - b
    );
    for (const H of horizons) {
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const e1 = indices[i]!;
          const e2 = indices[j]!;
          evaluationPairCount += 1;
          if (e2 <= e1 + H) {
            overlappingPairCount += 1;
            sameDatasetOverlapCount += 1;
            sameSymbolOverlapCount += 1;
            sameTimeframeOverlapCount += 1;
            labels.push(`OVERLAPPING_WINDOWS:${ds.datasetId}:E${e1}:E${e2}:H${H}`);
          }
        }
      }
    }
  }

  labels.sort((a, b) => a.localeCompare(b));

  return {
    overlapDependencyRisk: overlappingPairCount > 0,
    evaluationPairCount,
    overlappingPairCount,
    overlapRatio:
      evaluationPairCount > 0 ? overlappingPairCount / evaluationPairCount : null,
    sameDatasetOverlapCount,
    sameSymbolOverlapCount,
    sameTimeframeOverlapCount,
    overlappingWindowLabels: labels,
  };
}

function buildHorizonComparisons(
  cohortAnalytics: ReturnType<typeof buildMslHistoricalCohortAnalyticsReport>,
  horizons: readonly number[]
): MslHistoricalResearchHorizonComparisonRow[] {
  const rows: MslHistoricalResearchHorizonComparisonRow[] = [];
  for (const H of [...horizons].sort((a, b) => a - b)) {
    const cohorts = cohortAnalytics.cohorts.filter(
      (c) =>
        c.cohortDefinition.observationHorizonBars === H &&
        c.cohortDefinition.sampleStatus === "SUFFICIENT_HORIZON"
    );
    const sampleCount = cohorts.reduce((s, c) => s + c.sampleCount, 0);
    const forwardMeans = cohorts
      .map((c) => c.forwardReturnStats.mean)
      .filter((v): v is number => v !== null);
    const forwardMedians = cohorts
      .map((c) => c.forwardReturnStats.median)
      .filter((v): v is number => v !== null);
    const mfeMeans = cohorts.map((c) => c.mfeStats.mean).filter((v): v is number => v !== null);
    const maeMeans = cohorts.map((c) => c.maeStats.mean).filter((v): v is number => v !== null);

    const mean = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

    rows.push({
      observationHorizonBars: H,
      sampleCount,
      meanForwardReturn: mean(forwardMeans),
      medianForwardReturn: mean(forwardMedians),
      meanMfe: mean(mfeMeans),
      meanMae: mean(maeMeans),
    });
  }
  return rows;
}

function datasetMeta(ds: HistoricalResearchDataset): HistoricalResearchDatasetMeta {
  return {
    datasetId: ds.datasetId,
    symbol: ds.symbol,
    timeframe: ds.timeframe,
    datasetChecksum: ds.datasetChecksum,
    source: ds.source,
    closedCandleOnly: ds.closedCandleOnly,
    barDurationMs: ds.barDurationMs,
    fixturePath: ds.fixturePath,
    status: ds.status,
    firstEvaluationBar: ds.firstEvaluationBar,
    lastEvaluationBar: ds.lastEvaluationBar,
  };
}

export function buildMslHistoricalResearchBatchReport(
  input: BuildMslHistoricalResearchBatchReportInput
): MslHistoricalResearchBatchReportV1 {
  const checksumByDatasetId = new Map<string, string>();
  for (const d of input.datasets) {
    const prior = checksumByDatasetId.get(d.datasetId);
    if (prior !== undefined && prior !== d.datasetChecksum) {
      throw new HistoricalFrozenOhlcvDatasetError(
        `DATASET_CHECKSUM_CONFLICT for ${d.datasetId}: ${prior} vs ${d.datasetChecksum}`
      );
    }
    checksumByDatasetId.set(d.datasetId, d.datasetChecksum);
  }

  const t0 = performance.now();
  const swing = input.swingConfig ?? DEFAULT_SWING;
  const minE = input.minEvaluationBarIndex ?? defaultMinEvaluationBarIndex();
  const horizons = [...input.observationHorizonBars].sort((a, b) => a - b);
  const limitations = [
    "msl_historical_research_pipeline_v1",
    "DESCRIPTIVE_ONLY",
    "not_predictive_not_causal",
    "DERIVED_1H_4H_MTF_CANONICAL",
    "NATIVE_HTF_PRODUCTION_NOT_ESTABLISHED",
    "15M_NOT_ESTABLISHED",
  ];
  const unresolved: { code: string; message: string }[] = [];

  const validDatasets = input.datasets.filter((d) => d.status === "COMPLETE" && d.candles.length > 0);
  const invalidDatasets = input.datasets.filter((d) => d.status !== "COMPLETE" || d.candles.length === 0);

  for (const d of invalidDatasets) {
    unresolved.push({
      code: "DATASET_PARTIAL_OR_INVALID",
      message: `Dataset ${d.datasetId} status=${d.status}.`,
    });
  }

  const symbols = [...new Set(validDatasets.map((d) => d.symbol))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (symbols.length <= 1 && symbols[0] === "BTCUSDT") {
    unresolved.push({
      code: "MULTISYMBOL_DATA_NOT_SUPPLIED",
      message: "Only BTCUSDT loaded; other multisymbol slots not included in this run.",
    });
  }

  const allRecords: MslHistoricalEvidenceRecordV1[] = [];
  const skippedEvaluations: MslHistoricalResearchSkippedEvaluation[] = [];
  const evaluationsByDataset = new Map<string, number[]>();
  let requestedEvaluationCount = 0;
  let completedEvaluationCount = 0;

  const tEvidence0 = performance.now();

  for (const ds of validDatasets) {
    const { indices, skipped } = resolveEvaluationIndices({
      dataset: ds,
      evaluationIndices: input.evaluationIndices,
      startE: input.startE,
      endE: input.endE,
      step: input.step,
      minE,
    });
    skippedEvaluations.push(...skipped);
    evaluationsByDataset.set(ds.datasetId, indices);
    requestedEvaluationCount += indices.length + skipped.length;

    const htf = input.htfCandlesByDatasetId?.[ds.datasetId];
    const datasetIdForRecord =
      ds.symbol === "BTCUSDT" && ds.timeframe === "1H" ?
        MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1
      : ds.datasetId;

    for (const E of indices) {
      for (const H of horizons) {
        try {
          const batch = buildMslHistoricalEvidenceAtEvaluation({
            candles: ds.candles,
            evaluationBarIndex: E,
            observationHorizonBars: H,
            symbol: ds.symbol,
            timeframe: ds.timeframe,
            datasetId: datasetIdForRecord,
            datasetChecksum: ds.datasetChecksum,
            swingConfig: swing,
            htfCandles: htf,
            htfTimeframeId: htf ? "4H" : undefined,
          });
          allRecords.push(...batch);
          completedEvaluationCount += 1;
        } catch (err) {
          skippedEvaluations.push({
            datasetId: ds.datasetId,
            evaluationBarIndex: E,
            code: "EVIDENCE_GENERATION_FAILED",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  const evidenceGenerationMs = performance.now() - tEvidence0;

  allRecords.sort((a, b) => {
    if (a.symbol !== b.symbol) {
      return a.symbol.localeCompare(b.symbol);
    }
    if (a.evaluationBarIndex !== b.evaluationBarIndex) {
      return a.evaluationBarIndex - b.evaluationBarIndex;
    }
    const aId = a.eventId ?? "";
    const bId = b.eventId ?? "";
    return aId.localeCompare(bId);
  });

  const tAnalytics0 = performance.now();
  const cohortAnalytics = buildMslHistoricalCohortAnalyticsReport({ records: allRecords });

  let crossSymbolAggregate = null;
  if (symbols.length > 1) {
    const allSymbolRecords = allRecords.map((r) => ({
      ...r,
      symbol: "ALL_SYMBOLS" as const,
    }));
    crossSymbolAggregate = {
      aggregateLabel: "ALL_SYMBOLS" as const,
      cohortAnalytics: buildMslHistoricalCohortAnalyticsReport({
        records: allSymbolRecords,
      }),
      limitations: [
        "ALL_SYMBOLS_aggregate_not_independent",
        "cross_symbol_descriptive_only",
      ],
    };
  }

  const timeframes = [...new Set(validDatasets.map((d) => d.timeframe))].sort((a, b) =>
    a.localeCompare(b)
  );
  const crossTimeframeAggregates = timeframes.map((tf) => ({
    aggregateLabel: `TIMEFRAME_${tf}`,
    timeframesIncluded: [tf],
    cohortAnalytics: buildMslHistoricalCohortAnalyticsReport({
      records: allRecords.filter((r) => r.timeframe === tf),
    }),
    limitations: ["cross_timeframe_aggregate_explicit", "no_implicit_1H_4H_merge"],
  }));

  const analyticsGenerationMs = performance.now() - tAnalytics0;
  const totalProcessingMs = performance.now() - t0;

  const overlap = buildOverlapReport(validDatasets, evaluationsByDataset, horizons);
  if (overlap.overlapDependencyRisk) {
    limitations.push("overlap_dependency_risk=true");
  }

  const evidenceSummary = buildEvidenceSummary(allRecords);

  const evaluationConfig: MslHistoricalResearchEvaluationConfig = {
    evaluationIndices: [
      ...new Set(
        [...evaluationsByDataset.values()].flatMap((xs) => xs)
      ),
    ].sort((a, b) => a - b),
    observationHorizonBars: horizons,
    skippedEvaluations: [...skippedEvaluations].sort((a, b) => {
      if (a.datasetId !== b.datasetId) {
        return a.datasetId.localeCompare(b.datasetId);
      }
      return a.evaluationBarIndex - b.evaluationBarIndex;
    }),
  };

  const runConfig = {
    datasets: validDatasets.map((d) => ({
      datasetId: d.datasetId,
      checksum: d.datasetChecksum,
    })),
    evaluationConfig,
  };

  const perDatasetCoverage = validDatasets.map((ds) => {
    const indices = evaluationsByDataset.get(ds.datasetId) ?? [];
    const skipped = skippedEvaluations.filter((s) => s.datasetId === ds.datasetId).length;
    return {
      datasetId: ds.datasetId,
      symbol: ds.symbol,
      timeframe: ds.timeframe,
      datasetChecksum: ds.datasetChecksum,
      status: ds.status,
      firstEvaluationBar: ds.firstEvaluationBar,
      lastEvaluationBar: ds.lastEvaluationBar,
      requestedEvaluationCount: indices.length + skipped,
      completedEvaluationCount: indices.length * horizons.length,
      skippedEvaluationCount: skipped,
    };
  });

  return {
    schemaVersion: MSL_HISTORICAL_RESEARCH_BATCH_REPORT_SCHEMA_VERSION,
    runId: deterministicRunIdFromConfig(runConfig),
    datasets: validDatasets.map(datasetMeta),
    evaluationConfig,
    evidenceRecords: allRecords,
    evidenceSummary,
    cohortAnalytics,
    crossSymbolAggregate,
    crossTimeframeAggregates,
    horizonComparisons: buildHorizonComparisons(cohortAnalytics, horizons),
    coverage: {
      datasetCount: validDatasets.length,
      symbolCount: symbols.length,
      timeframeCount: timeframes.length,
      requestedEvaluationCount,
      completedEvaluationCount,
      skippedEvaluationCount: skippedEvaluations.length,
      perDataset: perDatasetCoverage,
    },
    overlap,
    performance: {
      evidenceGenerationMs,
      analyticsGenerationMs,
      totalProcessingMs,
    },
    limitations: [...new Set(limitations)].sort((a, b) => a.localeCompare(b)),
    unresolved: [...unresolved].sort((a, b) => {
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    }),
  };
}
