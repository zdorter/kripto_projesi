import type { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";
import type { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "./historical-position-path-contract";
import type { Candle } from "./types";

export const HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION = "1.0" as const;

export interface RunHistoricalPositionPathBatchInput {
  artifact: HistoricalMeasurementArtifact;
  candles: readonly Candle[];
  filter?: HistoricalMeasurementStatisticsFilter;
  /** When set, applies to every selected entry (overrides entry.horizonBars). */
  horizonBars?: number;
}

export interface HistoricalPositionPathBatchInputSummary {
  measurementSchemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  totalSnapshots: number;
  filteredSnapshotCount: number;
  candleCount: number;
  datasetSymbol: string;
  datasetTimeframe: string;
  artifactDatasetCandleCount: number;
  horizonBarsOverride: number | null;
}

export interface HistoricalPositionPathBatchResult {
  batchSchemaVersion: typeof HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION;
  positionModelId: typeof HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1;
  filter: HistoricalMeasurementStatisticsFilter;
  input: HistoricalPositionPathBatchInputSummary;
  results: HistoricalPositionPathResult[];
}
