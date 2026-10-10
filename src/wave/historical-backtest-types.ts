import type { HistoricalWalkForwardRangeError } from "./historical-production-walk-forward";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { HistoricalPositionOutcomeStatisticsReport } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionPathBatchResult } from "./historical-position-path-batch-types";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./setup/historical-measurement-contract";
import type { Candle, WaveEngineOptions } from "./types";
import { HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION } from "./historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION } from "./historical-position-outcome-statistics-types";
import { HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION } from "./historical-position-path-batch-types";

export const HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION = "1.0" as const;

export interface RunHistoricalBacktestInput {
  symbol: string;
  timeframeId: string;
  candles: readonly Candle[];
  startEvaluationBar: number;
  endEvaluationBar: number;
  horizonBars?: number;
  policyId?: HistoricalPositionOutcomePolicyId;
  filter?: HistoricalMeasurementStatisticsFilter;
  engineOptions?: WaveEngineOptions;
}

export interface HistoricalBacktestConfiguration {
  symbol: string;
  timeframeId: string;
  candleCount: number;
  startEvaluationBar: number | null;
  endEvaluationBar: number | null;
  horizonBars: number;
  policyId: HistoricalPositionOutcomePolicyId;
  filter: HistoricalMeasurementStatisticsFilter;
  rangeError: HistoricalWalkForwardRangeError | null;
  measurementSchemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  policySchemaVersion: typeof HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION;
  outcomeStatisticsSchemaVersion: typeof HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION;
  pathBatchSchemaVersion: typeof HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION;
  evaluatedEvaluationBars: number;
  totalArtifactSnapshots: number;
  filteredPathResults: number;
}

export interface HistoricalBacktestReport {
  schemaVersion: typeof HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION;
  configuration: HistoricalBacktestConfiguration;
  /** Frozen B-8 walk-forward observations (no recompute on read). */
  artifact: HistoricalMeasurementArtifact;
  /** B-10b batch output aligned with artifact filter. */
  pathBatch: HistoricalPositionPathBatchResult;
  /** B-10e policy outcome statistics (WIN/LOSS reporting via decisive counts). */
  outcomeStatistics: HistoricalPositionOutcomeStatisticsReport;
}
