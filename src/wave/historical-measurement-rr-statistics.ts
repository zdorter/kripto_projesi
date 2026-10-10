import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import { resolveCrossOutcomeColumn } from "./historical-measurement-cross-statistics";
import {
  HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS,
  HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS,
} from "./historical-measurement-cross-statistics-types";
import { selectHistoricalMeasurementEntries } from "./historical-measurement-statistics-filter";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import {
  HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS,
  HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID,
  HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS,
  HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION,
  type HistoricalMeasurementRRBucketCounts,
  type HistoricalMeasurementRRBucketRow,
  type HistoricalMeasurementRREvaluationColumnTotals,
  type HistoricalMeasurementRREvaluationMatrix,
  type HistoricalMeasurementRROutcomeColumnTotals,
  type HistoricalMeasurementRROutcomeMatrix,
  type HistoricalMeasurementRRStatisticsReport,
  type HistoricalMeasurementRRStatisticsSlice,
} from "./historical-measurement-rr-statistics-types";

/**
 * Canonical evaluation-time RR from the frozen reference bundle (B-8 snapshot).
 */
export function resolveHistoricalMeasurementCanonicalRrRatio(
  entry: HistoricalMeasurementArtifactEntry
): number | null {
  return entry.evaluation.references.rr.ratio;
}

export function isValidHistoricalMeasurementRrRatio(
  ratio: number | null | undefined
): ratio is number {
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio >= 0;
}

/**
 * Deterministic RR buckets (half-open intervals on non-negative finite RR).
 */
export function classifyHistoricalMeasurementRrBucketRow(
  ratio: number | null | undefined
): HistoricalMeasurementRRBucketRow {
  if (!isValidHistoricalMeasurementRrRatio(ratio)) {
    return HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID;
  }
  if (ratio < 1.0) {
    return "LT_1_0";
  }
  if (ratio < 1.5) {
    return "FROM_1_0_TO_1_5";
  }
  if (ratio < 2.0) {
    return "FROM_1_5_TO_2_0";
  }
  if (ratio < 3.0) {
    return "FROM_2_0_TO_3_0";
  }
  return "GTE_3_0";
}

export function resolveHistoricalMeasurementRrBucketRow(
  entry: HistoricalMeasurementArtifactEntry
): HistoricalMeasurementRRBucketRow {
  return classifyHistoricalMeasurementRrBucketRow(
    resolveHistoricalMeasurementCanonicalRrRatio(entry)
  );
}

function emptyBucketCounts(): HistoricalMeasurementRRBucketCounts {
  const counts = {} as HistoricalMeasurementRRBucketCounts;
  for (const bucket of HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS) {
    counts[bucket] = 0;
  }
  counts[HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID] = 0;
  return counts;
}

export function emptyHistoricalMeasurementRREvaluationMatrix(): HistoricalMeasurementRREvaluationMatrix {
  const matrix = {} as HistoricalMeasurementRREvaluationMatrix;
  for (const rrRow of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    const cells = {} as HistoricalMeasurementRREvaluationMatrix[HistoricalMeasurementRRBucketRow];
    for (const evalCol of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
      cells[evalCol] = 0;
    }
    matrix[rrRow] = cells;
  }
  return matrix;
}

export function emptyHistoricalMeasurementRROutcomeMatrix(): HistoricalMeasurementRROutcomeMatrix {
  const matrix = {} as HistoricalMeasurementRROutcomeMatrix;
  for (const rrRow of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    const cells = {} as HistoricalMeasurementRROutcomeMatrix[HistoricalMeasurementRRBucketRow];
    for (const outcomeCol of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
      cells[outcomeCol] = 0;
    }
    matrix[rrRow] = cells;
  }
  return matrix;
}

export function buildHistoricalMeasurementRRStatisticsSliceFromEntries(
  entries: readonly HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementRRStatisticsSlice {
  const bucketCounts = emptyBucketCounts();
  const rrByEvaluation = emptyHistoricalMeasurementRREvaluationMatrix();
  const rrByOutcome = emptyHistoricalMeasurementRROutcomeMatrix();

  for (const entry of entries) {
    const rrRow = resolveHistoricalMeasurementRrBucketRow(entry);
    bucketCounts[rrRow] += 1;

    const evalStatus = entry.evaluation.tradeEvaluation.status;
    rrByEvaluation[rrRow][evalStatus] += 1;

    const outcomeCol = resolveCrossOutcomeColumn(entry);
    rrByOutcome[rrRow][outcomeCol] += 1;
  }

  const evaluationColumnTotals =
    {} as HistoricalMeasurementRREvaluationColumnTotals;
  for (const evalCol of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
    let sum = 0;
    for (const rrRow of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
      sum += rrByEvaluation[rrRow][evalCol];
    }
    evaluationColumnTotals[evalCol] = sum;
  }

  const outcomeColumnTotals = {} as HistoricalMeasurementRROutcomeColumnTotals;
  for (const outcomeCol of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
    let sum = 0;
    for (const rrRow of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
      sum += rrByOutcome[rrRow][outcomeCol];
    }
    outcomeColumnTotals[outcomeCol] = sum;
  }

  const grandTotal = entries.length;

  return {
    bucketCounts,
    rrByEvaluation,
    rrByOutcome,
    evaluationColumnTotals,
    outcomeColumnTotals,
    grandTotal,
  };
}

function buildCohortRRSlice(
  artifact: HistoricalMeasurementArtifact,
  cohort: HistoricalMeasurementCohort
): HistoricalMeasurementRRStatisticsSlice {
  const entries = selectHistoricalMeasurementEntries(artifact, {
    cohorts: [cohort],
  });
  return buildHistoricalMeasurementRRStatisticsSliceFromEntries(entries);
}

/**
 * B-9d: RR bucket statistics (counts only; no performance semantics).
 */
export function aggregateHistoricalMeasurementRRStatistics(
  artifact: HistoricalMeasurementArtifact,
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementRRStatisticsReport {
  const entries = selectHistoricalMeasurementEntries(artifact, filter);
  const rr = buildHistoricalMeasurementRRStatisticsSliceFromEntries(entries);

  const cohorts = {} as HistoricalMeasurementRRStatisticsReport["cohorts"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    cohorts[cohort] = buildCohortRRSlice(artifact, cohort);
  }

  return {
    statisticsSchemaVersion: HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION,
    filter: {
      cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
    },
    rr,
    cohorts,
  };
}
