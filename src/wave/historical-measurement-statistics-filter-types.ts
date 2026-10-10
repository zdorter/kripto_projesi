import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementStatisticsReport } from "./historical-measurement-statistics-types";

/**
 * B-9b filter: when `cohorts` is set, a snapshot is included if it belongs to
 * **any** listed cohort (`entry.cohorts.includes(c)` OR semantics).
 * Omit `cohorts` or pass an empty array for no cohort filter (full artifact population).
 */
export interface HistoricalMeasurementStatisticsFilter {
  cohorts?: readonly HistoricalMeasurementCohort[];
}

export const HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION =
  "1.1" as const;

export type HistoricalMeasurementDenominatorId =
  | "TOTAL_SNAPSHOTS"
  | "FILTERED_SNAPSHOTS"
  | "TRADE_EVALUATED"
  | "OUTCOME_MEASURED";

export interface HistoricalMeasurementStatisticRate {
  numerator: number;
  denominator: number;
  /** null when denominator is 0 (not 0/0 → 0). */
  value: number | null;
  denominatorId: HistoricalMeasurementDenominatorId;
}

export interface HistoricalMeasurementDenominators {
  totalSnapshots: number;
  filteredSnapshots: number;
  measurablePaths: number;
  unmeasurablePaths: number;
  tradeEvaluated: number;
  tradeEvaluationPassed: number;
  tradeEvaluationFailed: number;
  tradeEvaluationInsufficientContext: number;
  outcomeMeasured: number;
  outcomeUnmeasured: number;
}

export interface HistoricalMeasurementStatisticsRates {
  tradeEvaluationPassRate: HistoricalMeasurementStatisticRate;
  outcomeMeasuredRate: HistoricalMeasurementStatisticRate;
}

export interface HistoricalMeasurementCohortStatisticsSlice {
  denominators: HistoricalMeasurementDenominators;
  core: HistoricalMeasurementStatisticsReport;
  rates: HistoricalMeasurementStatisticsRates;
}

export type HistoricalMeasurementCohortStatisticsMap = {
  [K in HistoricalMeasurementCohort]: HistoricalMeasurementCohortStatisticsSlice;
};

export interface HistoricalMeasurementFilteredStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION;
  filter: HistoricalMeasurementStatisticsFilter;
  denominators: HistoricalMeasurementDenominators;
  core: HistoricalMeasurementStatisticsReport;
  rates: HistoricalMeasurementStatisticsRates;
  cohorts: HistoricalMeasurementCohortStatisticsMap;
}
