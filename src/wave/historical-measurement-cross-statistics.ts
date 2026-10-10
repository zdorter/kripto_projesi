import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import { selectHistoricalMeasurementEntries } from "./historical-measurement-statistics-filter";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import {
  HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS,
  HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME,
  HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS,
  HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION,
  type HistoricalMeasurementCrossColumnTotals,
  type HistoricalMeasurementCrossOutcomeColumn,
  type HistoricalMeasurementCrossRowTotals,
  type HistoricalMeasurementCrossStatisticsReport,
  type HistoricalMeasurementCrossStatisticsSlice,
  type HistoricalMeasurementEvalOutcomeMatrix,
} from "./historical-measurement-cross-statistics-types";

export function resolveCrossOutcomeColumn(
  entry: HistoricalMeasurementArtifactEntry
): HistoricalMeasurementCrossOutcomeColumn {
  if (entry.outcome === null) {
    return HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME;
  }
  return entry.outcome.replay.outcome;
}

export function emptyHistoricalMeasurementEvalOutcomeMatrix(): HistoricalMeasurementEvalOutcomeMatrix {
  const matrix = {} as HistoricalMeasurementEvalOutcomeMatrix;
  for (const row of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
    const cells = {} as HistoricalMeasurementEvalOutcomeMatrix[TradeEvaluationStatus];
    for (const col of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
      cells[col] = 0;
    }
    matrix[row] = cells;
  }
  return matrix;
}

export function buildCrossStatisticsSliceFromEntries(
  entries: readonly HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementCrossStatisticsSlice {
  const matrix = emptyHistoricalMeasurementEvalOutcomeMatrix();

  for (const entry of entries) {
    const row = entry.evaluation.tradeEvaluation.status;
    const col = resolveCrossOutcomeColumn(entry);
    matrix[row][col] += 1;
  }

  const rowTotals = {} as HistoricalMeasurementCrossRowTotals;
  for (const row of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
    let sum = 0;
    for (const col of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
      sum += matrix[row][col];
    }
    rowTotals[row] = sum;
  }

  const columnTotals = {} as HistoricalMeasurementCrossColumnTotals;
  for (const col of HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS) {
    let sum = 0;
    for (const row of HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS) {
      sum += matrix[row][col];
    }
    columnTotals[col] = sum;
  }

  const grandTotal = entries.length;

  return {
    matrix,
    rowTotals,
    columnTotals,
    grandTotal,
  };
}

function buildCohortCrossSlice(
  artifact: HistoricalMeasurementArtifact,
  cohort: HistoricalMeasurementCohort
): HistoricalMeasurementCrossStatisticsSlice {
  const entries = selectHistoricalMeasurementEntries(artifact, {
    cohorts: [cohort],
  });
  return buildCrossStatisticsSliceFromEntries(entries);
}

/**
 * B-9c: Trade Evaluation × Outcome cross-tab (counts only; no win/loss mapping).
 */
export function aggregateHistoricalMeasurementCrossStatistics(
  artifact: HistoricalMeasurementArtifact,
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementCrossStatisticsReport {
  const entries = selectHistoricalMeasurementEntries(artifact, filter);
  const cross = buildCrossStatisticsSliceFromEntries(entries);

  const cohorts =
    {} as HistoricalMeasurementCrossStatisticsReport["cohorts"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    cohorts[cohort] = buildCohortCrossSlice(artifact, cohort);
  }

  return {
    statisticsSchemaVersion: HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION,
    filter: {
      cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
    },
    cross,
    cohorts,
  };
}
