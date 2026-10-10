import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalMeasurementRRBucketCounts } from "./historical-measurement-rr-statistics-types";
import type {
  HistoricalMeasurementOutcomeDistribution,
  HistoricalMeasurementTradeEvaluationDistribution,
} from "./historical-measurement-statistics-types";

export const HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

export const HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL =
  "NULL_OR_UNKNOWN_SYMBOL" as const;

export const HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME =
  "NULL_OR_UNKNOWN_TIMEFRAME" as const;

export const HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY =
  "NULL_OR_UNKNOWN_SETUP_FAMILY" as const;

export const HISTORICAL_MEASUREMENT_DIMENSION_KEY_SEPARATOR = "\u001f" as const;

export interface HistoricalMeasurementDimensionStatisticsSlice {
  totalSnapshots: number;
  tradeEvaluation: HistoricalMeasurementTradeEvaluationDistribution;
  outcome: HistoricalMeasurementOutcomeDistribution;
  rrBucketCounts: HistoricalMeasurementRRBucketCounts;
}

export type HistoricalMeasurementDimensionSliceMap = Record<
  string,
  HistoricalMeasurementDimensionStatisticsSlice
>;

export type HistoricalMeasurementSymbolTimeframeSetupFamilyTree = Record<
  string,
  Record<string, Record<string, HistoricalMeasurementDimensionStatisticsSlice>>
>;

export interface HistoricalMeasurementDimensionStatisticsBundle {
  global: HistoricalMeasurementDimensionStatisticsSlice;
  bySymbol: HistoricalMeasurementDimensionSliceMap;
  byTimeframe: HistoricalMeasurementDimensionSliceMap;
  bySetupFamily: HistoricalMeasurementDimensionSliceMap;
  bySymbolTimeframe: HistoricalMeasurementDimensionSliceMap;
  bySymbolSetupFamily: HistoricalMeasurementDimensionSliceMap;
  byTimeframeSetupFamily: HistoricalMeasurementDimensionSliceMap;
  symbolTimeframeSetupFamily: HistoricalMeasurementSymbolTimeframeSetupFamilyTree;
}

export type HistoricalMeasurementCohortDimensionStatisticsMap = {
  [K in HistoricalMeasurementCohort]: HistoricalMeasurementDimensionStatisticsBundle;
};

export interface HistoricalMeasurementDimensionStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION;
  filter: HistoricalMeasurementStatisticsFilter;
  dimensions: HistoricalMeasurementDimensionStatisticsBundle;
  cohorts: HistoricalMeasurementCohortDimensionStatisticsMap;
}
