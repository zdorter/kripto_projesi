import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type {
  HistoricalMeasurementCrossOutcomeColumn,
} from "./historical-measurement-cross-statistics-types";
import { HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS } from "./historical-measurement-cross-statistics-types";

export const HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION =
  "1.0" as const;

export const HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID =
  "NULL_OR_INVALID_RR" as const;

export type HistoricalMeasurementRRNumericalBucket =
  | "LT_1_0"
  | "FROM_1_0_TO_1_5"
  | "FROM_1_5_TO_2_0"
  | "FROM_2_0_TO_3_0"
  | "GTE_3_0";

export type HistoricalMeasurementRRBucketRow =
  | HistoricalMeasurementRRNumericalBucket
  | typeof HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID;

export const HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS: readonly HistoricalMeasurementRRNumericalBucket[] =
  [
    "LT_1_0",
    "FROM_1_0_TO_1_5",
    "FROM_1_5_TO_2_0",
    "FROM_2_0_TO_3_0",
    "GTE_3_0",
  ];

export const HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS: readonly HistoricalMeasurementRRBucketRow[] =
  [
    ...HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS,
    HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID,
  ];

export type HistoricalMeasurementRRBucketCounts = {
  [K in HistoricalMeasurementRRNumericalBucket]: number;
} & {
  [HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID]: number;
};

export type HistoricalMeasurementRREvaluationMatrix = {
  [R in HistoricalMeasurementRRBucketRow]: {
    [E in TradeEvaluationStatus]: number;
  };
};

export type HistoricalMeasurementRROutcomeMatrix = {
  [R in HistoricalMeasurementRRBucketRow]: {
    [O in HistoricalMeasurementCrossOutcomeColumn]: number;
  };
};

export type HistoricalMeasurementRREvaluationColumnTotals = {
  [E in TradeEvaluationStatus]: number;
};

export type HistoricalMeasurementRROutcomeColumnTotals = {
  [O in HistoricalMeasurementCrossOutcomeColumn]: number;
};

export interface HistoricalMeasurementRRStatisticsSlice {
  bucketCounts: HistoricalMeasurementRRBucketCounts;
  rrByEvaluation: HistoricalMeasurementRREvaluationMatrix;
  rrByOutcome: HistoricalMeasurementRROutcomeMatrix;
  evaluationColumnTotals: HistoricalMeasurementRREvaluationColumnTotals;
  outcomeColumnTotals: HistoricalMeasurementRROutcomeColumnTotals;
  grandTotal: number;
}

export type HistoricalMeasurementCohortRRStatisticsMap = {
  [K in HistoricalMeasurementCohort]: HistoricalMeasurementRRStatisticsSlice;
};

export interface HistoricalMeasurementRRStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION;
  filter: HistoricalMeasurementStatisticsFilter;
  rr: HistoricalMeasurementRRStatisticsSlice;
  cohorts: HistoricalMeasurementCohortRRStatisticsMap;
}

/** Re-export for matrix row alignment with trade evaluation distribution keys. */
export const HISTORICAL_MEASUREMENT_RR_EVALUATION_COLUMNS =
  HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS;
