import type { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./setup/historical-measurement-contract";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

export const HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION = "1.0" as const;

export interface HistoricalMeasurementStatisticsInput {
  measurementSchemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
}

export interface HistoricalMeasurementStatisticsSample {
  totalSnapshots: number;
  uniqueProspectiveSetupIds: number;
  uniqueSourceSetupIds: number;
}

export type HistoricalMeasurementOutcomeDistribution = {
  [K in ProspectiveSetupOutcomeReplayStatus]: number;
} & {
  nullOutcome: number;
};

export type HistoricalMeasurementTradeEvaluationDistribution = {
  [K in TradeEvaluationStatus]: number;
};

export interface HistoricalMeasurementStatisticsDataQuality {
  pathMeasured: number;
  pathUnmeasured: number;
}

export interface HistoricalMeasurementStatisticsDistributions {
  outcome: HistoricalMeasurementOutcomeDistribution;
  tradeEvaluation: HistoricalMeasurementTradeEvaluationDistribution;
}

export interface HistoricalMeasurementStatisticsReport {
  statisticsSchemaVersion: typeof HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION;
  input: HistoricalMeasurementStatisticsInput;
  sample: HistoricalMeasurementStatisticsSample;
  distributions: HistoricalMeasurementStatisticsDistributions;
  dataQuality: HistoricalMeasurementStatisticsDataQuality;
}
