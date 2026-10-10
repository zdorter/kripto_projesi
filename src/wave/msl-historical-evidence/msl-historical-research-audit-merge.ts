import { HistoricalFrozenOhlcvDatasetError } from "../historical-frozen-ohlcv-dataset";
import type { MslHistoricalCohortAnalyticsV1 } from "./msl-historical-cohort-analytics-types";
import { MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION } from "./msl-historical-cohort-analytics-types";
import type { MslHistoricalNumericDistributionStats } from "./msl-historical-cohort-analytics-types";
import { buildOverlapReport } from "./msl-historical-research-pipeline-batch";
import { deterministicRunIdFromConfig } from "./msl-historical-research-pipeline-serialize";
import type {
  HistoricalResearchDatasetMeta,
  MslHistoricalResearchBatchReportV1,
  MslHistoricalResearchDatasetCoverage,
  MslHistoricalResearchEvaluationConfig,
  MslHistoricalResearchEvidenceSummary,
  MslHistoricalResearchHorizonComparisonRow,
  MslHistoricalResearchOverlapReport,
  MslHistoricalResearchPerformanceMetrics,
} from "./msl-historical-research-pipeline-types";

export const MULTISYMBOL_DATA_NOT_SUPPLIED_CODE = "MULTISYMBOL_DATA_NOT_SUPPLIED" as const;

export function cohortDefKey(def: MslHistoricalCohortAnalyticsV1["cohortDefinition"]): string {
  return JSON.stringify(def);
}

function mergeNumericStats(
  a: MslHistoricalNumericDistributionStats,
  b: MslHistoricalNumericDistributionStats
): MslHistoricalNumericDistributionStats {
  const count = a.count + b.count;
  if (count === 0) {
    return a;
  }
  const mean =
    a.mean !== null && b.mean !== null ?
      (a.mean * a.count + b.mean * b.count) / count
    : a.mean ?? b.mean;
  return {
    count,
    min:
      a.min !== null && b.min !== null ? Math.min(a.min, b.min)
      : a.min ?? b.min,
    max:
      a.max !== null && b.max !== null ? Math.max(a.max, b.max)
      : a.max ?? b.max,
    mean,
    median: mean,
    p25: mean,
    p50: mean,
    p75: mean,
    percentileAlgorithm: a.percentileAlgorithm ?? b.percentileAlgorithm,
  };
}

export function mergeCohortRows(
  a: MslHistoricalCohortAnalyticsV1,
  b: MslHistoricalCohortAnalyticsV1
): MslHistoricalCohortAnalyticsV1 {
  return {
    ...a,
    sampleCount: a.sampleCount + b.sampleCount,
    eventCount: a.eventCount + b.eventCount,
    noEventCount: a.noEventCount + b.noEventCount,
    sufficientHorizonCount: a.sufficientHorizonCount + b.sufficientHorizonCount,
    insufficientHorizonCount: a.insufficientHorizonCount + b.insufficientHorizonCount,
    overlappingWindowRisk: a.overlappingWindowRisk || b.overlappingWindowRisk,
    forwardReturnStats: mergeNumericStats(a.forwardReturnStats, b.forwardReturnStats),
    mfeStats: mergeNumericStats(a.mfeStats, b.mfeStats),
    maeStats: mergeNumericStats(a.maeStats, b.maeStats),
    rangeExpansionStats: mergeNumericStats(a.rangeExpansionStats, b.rangeExpansionStats),
    eventCounts: {
      subsequentBosCount: a.eventCounts.subsequentBosCount + b.eventCounts.subsequentBosCount,
      subsequentChochCount: a.eventCounts.subsequentChochCount + b.eventCounts.subsequentChochCount,
      subsequentMssCount: a.eventCounts.subsequentMssCount + b.eventCounts.subsequentMssCount,
      subsequentTouchCount: a.eventCounts.subsequentTouchCount + b.eventCounts.subsequentTouchCount,
      subsequentCrossTfTouchCount:
        a.eventCounts.subsequentCrossTfTouchCount + b.eventCounts.subsequentCrossTfTouchCount,
      subsequentSweepCount: a.eventCounts.subsequentSweepCount + b.eventCounts.subsequentSweepCount,
      subsequentTakenCount: a.eventCounts.subsequentTakenCount + b.eventCounts.subsequentTakenCount,
      subsequentReclaimCount:
        a.eventCounts.subsequentReclaimCount + b.eventCounts.subsequentReclaimCount,
      associationLiquidityToBosCount:
        a.eventCounts.associationLiquidityToBosCount + b.eventCounts.associationLiquidityToBosCount,
      associationLiquidityToChochCount:
        a.eventCounts.associationLiquidityToChochCount + b.eventCounts.associationLiquidityToChochCount,
      firstSubsequentEventFamilyCounts: Object.fromEntries(
        [...new Set([
          ...Object.keys(a.eventCounts.firstSubsequentEventFamilyCounts),
          ...Object.keys(b.eventCounts.firstSubsequentEventFamilyCounts),
        ])].sort((x, y) => x.localeCompare(y)).map((k) => [
          k,
          (a.eventCounts.firstSubsequentEventFamilyCounts[k] ?? 0) +
            (b.eventCounts.firstSubsequentEventFamilyCounts[k] ?? 0),
        ])
      ),
    },
    observedCoOccurrenceCounts: [],
    limitations: [...new Set([...a.limitations, ...b.limitations, "cohort_row_merged"])],
    unresolved: [...a.unresolved, ...b.unresolved],
  };
}

export function dedupeHistoricalResearchDatasetMetas(
  datasets: readonly HistoricalResearchDatasetMeta[]
): HistoricalResearchDatasetMeta[] {
  const byId = new Map<string, HistoricalResearchDatasetMeta>();
  for (const d of datasets) {
    const prior = byId.get(d.datasetId);
    if (prior !== undefined) {
      if (prior.datasetChecksum !== d.datasetChecksum) {
        throw new HistoricalFrozenOhlcvDatasetError(
          `DATASET_CHECKSUM_CONFLICT for ${d.datasetId}: ${prior.datasetChecksum} vs ${d.datasetChecksum}`
        );
      }
      continue;
    }
    byId.set(d.datasetId, d);
  }
  return [...byId.values()].sort((a, b) => a.datasetId.localeCompare(b.datasetId));
}

export function filterMultisymbolUnresolvedItems(
  unresolved: readonly { code: string; message: string }[],
  symbolCount: number
): { code: string; message: string }[] {
  const filtered =
    symbolCount > 1 ?
      unresolved.filter((u) => u.code !== MULTISYMBOL_DATA_NOT_SUPPLIED_CODE)
    : unresolved;
  return [...filtered].sort((a, b) => {
    if (a.code !== b.code) {
      return a.code.localeCompare(b.code);
    }
    return a.message.localeCompare(b.message);
  });
}

function mergeSkippedEvaluations(
  a: MslHistoricalResearchEvaluationConfig["skippedEvaluations"],
  b: MslHistoricalResearchEvaluationConfig["skippedEvaluations"]
): MslHistoricalResearchEvaluationConfig["skippedEvaluations"] {
  const map = new Map<string, (typeof a)[number]>();
  for (const row of [...a, ...b]) {
    map.set(`${row.datasetId}:${row.evaluationBarIndex}:${row.code}`, row);
  }
  return [...map.values()].sort((x, y) => {
    if (x.datasetId !== y.datasetId) {
      return x.datasetId.localeCompare(y.datasetId);
    }
    return x.evaluationBarIndex - y.evaluationBarIndex;
  });
}

export function mergeEvaluationConfigs(
  configs: readonly MslHistoricalResearchEvaluationConfig[]
): MslHistoricalResearchEvaluationConfig {
  const evaluationIndices = [
    ...new Set(configs.flatMap((c) => [...c.evaluationIndices])),
  ].sort((a, b) => a - b);
  const observationHorizonBars = [
    ...new Set(configs.flatMap((c) => [...c.observationHorizonBars])),
  ].sort((a, b) => a - b);
  let skipped = configs[0]?.skippedEvaluations ?? [];
  for (let i = 1; i < configs.length; i++) {
    skipped = mergeSkippedEvaluations(skipped, configs[i]!.skippedEvaluations);
  }
  return { evaluationIndices, observationHorizonBars, skippedEvaluations: skipped };
}

function mergeEvidenceSummaries(
  summaries: readonly MslHistoricalResearchEvidenceSummary[]
): MslHistoricalResearchEvidenceSummary {
  let strictRecordCount = 0;
  let disclosureRecordCount = 0;
  let observationOnlyRecordCount = 0;
  const eventFamilyCounts: Record<string, number> = {};
  for (const s of summaries) {
    strictRecordCount += s.strictRecordCount;
    disclosureRecordCount += s.disclosureRecordCount;
    observationOnlyRecordCount += s.observationOnlyRecordCount;
    for (const [k, v] of Object.entries(s.eventFamilyCounts)) {
      eventFamilyCounts[k] = (eventFamilyCounts[k] ?? 0) + v;
    }
  }
  return {
    totalRecordCount: strictRecordCount + disclosureRecordCount + observationOnlyRecordCount,
    strictRecordCount,
    disclosureRecordCount,
    observationOnlyRecordCount,
    eventFamilyCounts: Object.fromEntries(
      Object.entries(eventFamilyCounts).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

function mergePerformance(
  parts: readonly MslHistoricalResearchPerformanceMetrics[]
): MslHistoricalResearchPerformanceMetrics {
  return parts.reduce(
    (acc, b) => ({
      evidenceGenerationMs: acc.evidenceGenerationMs + b.evidenceGenerationMs,
      analyticsGenerationMs: acc.analyticsGenerationMs + b.analyticsGenerationMs,
      totalProcessingMs: acc.totalProcessingMs + b.totalProcessingMs,
    }),
    { evidenceGenerationMs: 0, analyticsGenerationMs: 0, totalProcessingMs: 0 }
  );
}

export function mergeCohortsByDefinitionKey(
  cohorts: readonly MslHistoricalCohortAnalyticsV1[]
): MslHistoricalCohortAnalyticsV1[] {
  const map = new Map<string, MslHistoricalCohortAnalyticsV1>();
  for (const c of cohorts) {
    const key = cohortDefKey(c.cohortDefinition);
    const prior = map.get(key);
    map.set(key, prior ? mergeCohortRows(prior, c) : c);
  }
  return [...map.values()].sort((a, b) =>
    cohortDefKey(a.cohortDefinition).localeCompare(cohortDefKey(b.cohortDefinition))
  );
}

function mergePerDatasetCoverage(
  rows: readonly MslHistoricalResearchDatasetCoverage[]
): MslHistoricalResearchDatasetCoverage[] {
  const map = new Map<string, MslHistoricalResearchDatasetCoverage>();
  for (const row of rows) {
    const prior = map.get(row.datasetId);
    if (!prior) {
      map.set(row.datasetId, { ...row });
      continue;
    }
    map.set(row.datasetId, {
      ...prior,
      requestedEvaluationCount:
        prior.requestedEvaluationCount + row.requestedEvaluationCount,
      completedEvaluationCount:
        prior.completedEvaluationCount + row.completedEvaluationCount,
      skippedEvaluationCount: prior.skippedEvaluationCount + row.skippedEvaluationCount,
    });
  }
  return [...map.values()].sort((a, b) => a.datasetId.localeCompare(b.datasetId));
}

export function mergeHorizonComparisonRows(
  batches: readonly MslHistoricalResearchBatchReportV1[]
): MslHistoricalResearchHorizonComparisonRow[] {
  const horizons = [
    ...new Set(batches.flatMap((b) => b.horizonComparisons.map((r) => r.observationHorizonBars))),
  ].sort((a, b) => a - b);
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return horizons.map((H) => {
    const rows = batches.flatMap((b) =>
      b.horizonComparisons.filter((r) => r.observationHorizonBars === H)
    );
    return {
      observationHorizonBars: H,
      sampleCount: rows.reduce((s, r) => s + r.sampleCount, 0),
      meanForwardReturn: mean(rows.map((r) => r.meanForwardReturn)),
      medianForwardReturn: mean(rows.map((r) => r.medianForwardReturn)),
      meanMfe: mean(rows.map((r) => r.meanMfe)),
      meanMae: mean(rows.map((r) => r.meanMae)),
    };
  });
}

export function rebuildCrossTimeframeAggregatesFromCohorts(
  cohortAnalytics: MslHistoricalResearchBatchReportV1["cohortAnalytics"]
): MslHistoricalResearchBatchReportV1["crossTimeframeAggregates"] {
  const timeframes = [...cohortAnalytics.timeframesPresent].sort((a, b) => a.localeCompare(b));
  return timeframes.map((tf) => {
    const tfCohorts = cohortAnalytics.cohorts.filter((c) => c.cohortDefinition.timeframe === tf);
    return {
      aggregateLabel: `TIMEFRAME_${tf}`,
      timeframesIncluded: [tf],
      cohortAnalytics: {
        schemaVersion: MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION,
        datasetIds: [...cohortAnalytics.datasetIds],
        datasetChecksums: [...cohortAnalytics.datasetChecksums],
        symbolsPresent: [...cohortAnalytics.symbolsPresent],
        timeframesPresent: [tf],
        multisymbolDataSupplied: cohortAnalytics.multisymbolDataSupplied,
        overlappingWindowRisk: tfCohorts.some((c) => c.overlappingWindowRisk),
        cohorts: tfCohorts,
        limitations: [
          "cross_timeframe_aggregate_explicit",
          "no_implicit_1H_4H_merge",
          "rebuilt_from_merged_cohort_rows",
        ],
        unresolved: [...cohortAnalytics.unresolved],
      },
      limitations: ["cross_timeframe_aggregate_explicit", "no_implicit_1H_4H_merge"],
    };
  });
}

export function computeOverlapForCanonicalGrid(input: {
  datasets: readonly HistoricalResearchDatasetMeta[];
  evaluationIndices: readonly number[];
  observationHorizonBars: readonly number[];
}): MslHistoricalResearchOverlapReport {
  const evaluationsByDataset = new Map<string, number[]>();
  for (const ds of input.datasets) {
    const indices = [...input.evaluationIndices]
      .filter((e) => e >= ds.firstEvaluationBar && e <= ds.lastEvaluationBar)
      .sort((a, b) => a - b);
    evaluationsByDataset.set(ds.datasetId, indices);
  }
  return buildOverlapReport(input.datasets, evaluationsByDataset, input.observationHorizonBars);
}

export function incrementallyMergeMiniBatchReport(
  acc: MslHistoricalResearchBatchReportV1 | null,
  mini: MslHistoricalResearchBatchReportV1
): MslHistoricalResearchBatchReportV1 {
  if (!acc) {
    return { ...mini, evidenceRecords: [] };
  }

  const cohorts = mergeCohortsByDefinitionKey([
    ...acc.cohortAnalytics.cohorts,
    ...mini.cohortAnalytics.cohorts,
  ]);
  const evaluationConfig = mergeEvaluationConfigs([acc.evaluationConfig, mini.evaluationConfig]);
  const evidenceSummary = mergeEvidenceSummaries([acc.evidenceSummary, mini.evidenceSummary]);
  const performance = mergePerformance([acc.performance, mini.performance]);
  const datasets = dedupeHistoricalResearchDatasetMetas([...acc.datasets, ...mini.datasets]);
  const limitations = [
    ...new Set([...acc.limitations, ...mini.limitations, "incremental_cohort_merge"]),
  ].sort((a, b) => a.localeCompare(b));
  const unresolved = [...acc.unresolved, ...mini.unresolved].sort((a, b) => {
    if (a.code !== b.code) {
      return a.code.localeCompare(b.code);
    }
    return a.message.localeCompare(b.message);
  });

  const perDataset = mergePerDatasetCoverage([...acc.coverage.perDataset, ...mini.coverage.perDataset]);

  return {
    ...acc,
    evidenceRecords: [],
    datasets,
    evaluationConfig,
    evidenceSummary,
    performance,
    limitations,
    unresolved,
    cohortAnalytics: {
      ...acc.cohortAnalytics,
      cohorts,
      limitations: [
        ...limitations,
        "merged_percentiles_mean_approximation",
      ],
      overlappingWindowRisk: cohorts.some((c) => c.overlappingWindowRisk),
    },
    crossTimeframeAggregates: [],
    horizonComparisons: mergeHorizonComparisonRows([acc, mini]),
    coverage: {
      datasetCount: datasets.length,
      symbolCount: new Set(datasets.map((d) => d.symbol)).size,
      timeframeCount: new Set(datasets.map((d) => d.timeframe)).size,
      requestedEvaluationCount:
        acc.coverage.requestedEvaluationCount + mini.coverage.requestedEvaluationCount,
      completedEvaluationCount:
        acc.coverage.completedEvaluationCount + mini.coverage.completedEvaluationCount,
      skippedEvaluationCount:
        acc.coverage.skippedEvaluationCount + mini.coverage.skippedEvaluationCount,
      perDataset,
    },
    overlap: acc.overlap,
  };
}

export function finalizeSingleSymbolBatchReport(
  batch: MslHistoricalResearchBatchReportV1,
  canonical: {
    evaluationIndices: readonly number[];
    observationHorizonBars: readonly number[];
  }
): MslHistoricalResearchBatchReportV1 {
  const datasets = dedupeHistoricalResearchDatasetMetas(batch.datasets);
  const evaluationConfig: MslHistoricalResearchEvaluationConfig = {
    evaluationIndices: [...canonical.evaluationIndices].sort((a, b) => a - b),
    observationHorizonBars: [...canonical.observationHorizonBars].sort((a, b) => a - b),
    skippedEvaluations: batch.evaluationConfig.skippedEvaluations,
  };
  const overlap = computeOverlapForCanonicalGrid({
    datasets,
    evaluationIndices: evaluationConfig.evaluationIndices,
    observationHorizonBars: evaluationConfig.observationHorizonBars,
  });
  const cohorts = mergeCohortsByDefinitionKey(batch.cohortAnalytics.cohorts);
  const symbolCount = new Set(datasets.map((d) => d.symbol)).size;
  const unresolved = filterMultisymbolUnresolvedItems(batch.unresolved, symbolCount);
  const cohortAnalytics = {
    ...batch.cohortAnalytics,
    datasetIds: datasets.map((d) => d.datasetId),
    datasetChecksums: datasets.map((d) => d.datasetChecksum),
    symbolsPresent: [...new Set(datasets.map((d) => d.symbol))].sort((a, b) => a.localeCompare(b)),
    timeframesPresent: [...new Set(datasets.map((d) => d.timeframe))].sort((a, b) =>
      a.localeCompare(b)
    ),
    multisymbolDataSupplied: datasets.length > 1,
    overlappingWindowRisk: overlap.overlapDependencyRisk,
    cohorts,
    unresolved: filterMultisymbolUnresolvedItems(batch.cohortAnalytics.unresolved, symbolCount),
  };
  const crossTimeframeAggregates = rebuildCrossTimeframeAggregatesFromCohorts(cohortAnalytics);
  const runConfig = {
    datasets: datasets.map((d) => ({ datasetId: d.datasetId, checksum: d.datasetChecksum })),
    evaluationConfig,
  };
  return {
    ...batch,
    runId: deterministicRunIdFromConfig(runConfig),
    datasets,
    evaluationConfig,
    cohortAnalytics,
    crossTimeframeAggregates,
    overlap,
    unresolved,
    coverage: {
      ...batch.coverage,
      datasetCount: datasets.length,
      symbolCount,
      timeframeCount: new Set(datasets.map((d) => d.timeframe)).size,
      perDataset: mergePerDatasetCoverage(batch.coverage.perDataset),
    },
  };
}

export interface MergeMslHistoricalResearchBatchReportsOptions {
  extraUnresolved?: readonly { code: string; message: string }[];
  canonicalEvaluationIndices?: readonly number[];
  canonicalObservationHorizonBars?: readonly number[];
}

export function mergeMslHistoricalResearchBatchReports(
  batches: readonly MslHistoricalResearchBatchReportV1[],
  options: MergeMslHistoricalResearchBatchReportsOptions = {}
): MslHistoricalResearchBatchReportV1 {
  if (batches.length === 0) {
    throw new Error("mergeMslHistoricalResearchBatchReports requires at least one batch.");
  }
  const extraUnresolved = options.extraUnresolved ?? [];
  const datasets = dedupeHistoricalResearchDatasetMetas(batches.flatMap((b) => [...b.datasets]));
  const evaluationConfig =
    options.canonicalEvaluationIndices && options.canonicalObservationHorizonBars ?
      {
        evaluationIndices: [...options.canonicalEvaluationIndices].sort((a, b) => a - b),
        observationHorizonBars: [...options.canonicalObservationHorizonBars].sort((a, b) => a - b),
        skippedEvaluations: mergeEvaluationConfigs(batches.map((b) => b.evaluationConfig))
          .skippedEvaluations,
      }
    : mergeEvaluationConfigs(batches.map((b) => b.evaluationConfig));

  const cohorts = mergeCohortsByDefinitionKey(batches.flatMap((b) => [...b.cohortAnalytics.cohorts]));
  const overlap = computeOverlapForCanonicalGrid({
    datasets,
    evaluationIndices: evaluationConfig.evaluationIndices,
    observationHorizonBars: evaluationConfig.observationHorizonBars,
  });

  const symbolCount = new Set(datasets.map((d) => d.symbol)).size;
  const limitations = [
    ...new Set([
      ...batches.flatMap((b) => [...b.limitations]),
      "msl_14_sequential_symbol_merge",
      batches.length > 1 ? "ALL_SYMBOLS_aggregate_merged_cohort_pass" : "single_symbol_pass",
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const unresolved = filterMultisymbolUnresolvedItems(
    [
      ...new Set([
        ...batches.flatMap((b) => [...b.unresolved]),
        ...extraUnresolved,
      ].map((u) => JSON.stringify(u))),
    ].map((s) => JSON.parse(s) as { code: string; message: string }),
    symbolCount
  );

  const validDatasets = datasets.filter((d) => d.status === "COMPLETE");
  const runConfig = {
    datasets: validDatasets.map((d) => ({ datasetId: d.datasetId, checksum: d.datasetChecksum })),
    evaluationConfig,
  };

  const cohortAnalytics = {
    ...batches[0]!.cohortAnalytics,
    datasetIds: validDatasets.map((d) => d.datasetId),
    datasetChecksums: validDatasets.map((d) => d.datasetChecksum),
    symbolsPresent: [...new Set(validDatasets.map((d) => d.symbol))].sort((a, b) =>
      a.localeCompare(b)
    ),
    timeframesPresent: [...new Set(validDatasets.map((d) => d.timeframe))].sort((a, b) =>
      a.localeCompare(b)
    ),
    multisymbolDataSupplied: validDatasets.length > 1,
    overlappingWindowRisk: overlap.overlapDependencyRisk,
    cohorts,
    limitations: [...limitations],
    unresolved: filterMultisymbolUnresolvedItems(
      batches.flatMap((b) => [...b.cohortAnalytics.unresolved]),
      symbolCount
    ),
  };

  return {
    schemaVersion: batches[0]!.schemaVersion,
    runId: deterministicRunIdFromConfig(runConfig),
    datasets,
    evaluationConfig,
    evidenceRecords: [],
    evidenceSummary: mergeEvidenceSummaries(batches.map((b) => b.evidenceSummary)),
    cohortAnalytics,
    crossSymbolAggregate: null,
    crossTimeframeAggregates: rebuildCrossTimeframeAggregatesFromCohorts(cohortAnalytics),
    horizonComparisons: mergeHorizonComparisonRows(batches),
    coverage: {
      datasetCount: validDatasets.length,
      symbolCount,
      timeframeCount: new Set(validDatasets.map((d) => d.timeframe)).size,
      requestedEvaluationCount: batches.reduce((s, b) => s + b.coverage.requestedEvaluationCount, 0),
      completedEvaluationCount: batches.reduce((s, b) => s + b.coverage.completedEvaluationCount, 0),
      skippedEvaluationCount: batches.reduce((s, b) => s + b.coverage.skippedEvaluationCount, 0),
      perDataset: mergePerDatasetCoverage(batches.flatMap((b) => [...b.coverage.perDataset])),
    },
    overlap,
    performance: mergePerformance(batches.map((b) => b.performance)),
    limitations,
    unresolved,
  };
}
