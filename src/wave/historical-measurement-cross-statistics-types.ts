import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";

export const HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

/** Matrix column for missing outcome attachment (not part of B-6 enum). */
export const HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME = "NULL_OUTCOME" as const;

export type HistoricalMeasurementCrossOutcomeColumn =
  | ProspectiveSetupOutcomeReplayStatus
  | typeof HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME;

export const HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS: readonly HistoricalMeasurementCrossOutcomeColumn[] =
  [
    "TARGET_TOUCHED",
    "INVALIDATION_TOUCHED",
    "AMBIGUOUS",
    "NO_TOUCH",
    "NO_FUTURE_DATA",
    "INSUFFICIENT_CONTEXT",
    HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME,
  ];

export const HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS: readonly TradeEvaluationStatus[] =
  ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export type HistoricalMeasurementEvalOutcomeMatrix = {
  [K in TradeEvaluationStatus]: {
    [C in HistoricalMeasurementCrossOutcomeColumn]: number;
  };
};

export type HistoricalMeasurementCrossColumnTotals = {
  [C in HistoricalMeasurementCrossOutcomeColumn]: number;
};

export type HistoricalMeasurementCrossRowTotals = {
  [K in TradeEvaluationStatus]: number;
};

export interface HistoricalMeasurementCrossStatisticsSlice {
  matrix: HistoricalMeasurementEvalOutcomeMatrix;
  rowTotals: HistoricalMeasurementCrossRowTotals;
  columnTotals: HistoricalMeasurementCrossColumnTotals;
  grandTotal: number;
}

export type HistoricalMeasurementCohortCrossStatisticsMap = {
  [K in HistoricalMeasurementCohort]: HistoricalMeasurementCrossStatisticsSlice;
};

export interface HistoricalMeasurementCrossStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION;
  filter: HistoricalMeasurementStatisticsFilter;
  cross: HistoricalMeasurementCrossStatisticsSlice;
  cohorts: HistoricalMeasurementCohortCrossStatisticsMap;
}
