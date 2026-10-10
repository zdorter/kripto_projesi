import {
  compareHistoricalMeasurementArtifactEntryOrder,
  sortHistoricalMeasurementArtifactEntries,
} from "./historical-measurement-artifact";
import { selectHistoricalMeasurementEntries } from "./historical-measurement-statistics-filter";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "./historical-position-path-contract";
import { resolveHistoricalPositionPathV1 } from "./historical-position-path";
import {
  HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION,
  type HistoricalPositionPathBatchResult,
  type RunHistoricalPositionPathBatchInput,
} from "./historical-position-path-batch-types";
import type { Candle } from "./types";

export type HistoricalPositionPathBatchValidationErrorCode =
  | "CANDLE_COUNT_MISMATCH"
  | "ENTRY_SYMBOL_MISMATCH"
  | "ENTRY_TIMEFRAME_MISMATCH";

export class HistoricalPositionPathBatchValidationError extends Error {
  readonly code: HistoricalPositionPathBatchValidationErrorCode;

  constructor(
    code: HistoricalPositionPathBatchValidationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "HistoricalPositionPathBatchValidationError";
    this.code = code;
  }
}

function normalizeFilter(
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementStatisticsFilter {
  return {
    cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
  };
}

/**
 * Ensures the candle series matches the artifact dataset descriptor (B-8 envelope).
 */
export function assertHistoricalPositionPathBatchCandleContract(
  artifact: HistoricalMeasurementArtifact,
  candles: readonly Candle[]
): void {
  const { dataset } = artifact;
  if (candles.length !== dataset.candleCount) {
    throw new HistoricalPositionPathBatchValidationError(
      "CANDLE_COUNT_MISMATCH",
      `Candle count ${candles.length} does not match artifact dataset candleCount ${dataset.candleCount}`
    );
  }
}

function assertEntryDatasetAlignment(
  artifact: HistoricalMeasurementArtifact,
  entrySymbol: string,
  entryTimeframe: string,
  snapshotId: string
): void {
  const { dataset } = artifact;
  if (entrySymbol !== dataset.symbol) {
    throw new HistoricalPositionPathBatchValidationError(
      "ENTRY_SYMBOL_MISMATCH",
      `Entry symbol ${entrySymbol} does not match artifact dataset symbol ${dataset.symbol} (snapshotId ${snapshotId})`
    );
  }
  if (entryTimeframe !== dataset.timeframe) {
    throw new HistoricalPositionPathBatchValidationError(
      "ENTRY_TIMEFRAME_MISMATCH",
      `Entry timeframe ${entryTimeframe} does not match artifact dataset timeframe ${dataset.timeframe} (snapshotId ${snapshotId})`
    );
  }
}

function sortSelectedEntries(
  entries: ReturnType<typeof selectHistoricalMeasurementEntries>
) {
  return sortHistoricalMeasurementArtifactEntries([...entries]);
}

/**
 * B-10b: batch Position Path V1 for filtered artifact snapshots (one result per entry).
 */
export function runHistoricalPositionPathBatch(
  input: RunHistoricalPositionPathBatchInput
): HistoricalPositionPathBatchResult {
  const { artifact, candles } = input;
  const filter = normalizeFilter(input.filter);

  assertHistoricalPositionPathBatchCandleContract(artifact, candles);

  const selected = selectHistoricalMeasurementEntries(artifact, filter);
  const ordered = sortSelectedEntries(selected);

  const results = ordered.map((entry) => {
    assertEntryDatasetAlignment(
      artifact,
      entry.symbol,
      entry.timeframe,
      entry.snapshotId
    );
    return resolveHistoricalPositionPathV1({
      entry,
      candles,
      horizonBars: input.horizonBars,
    });
  });

  return {
    batchSchemaVersion: HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    filter,
    input: {
      measurementSchemaVersion: artifact.schemaVersion,
      totalSnapshots: artifact.measurements.length,
      filteredSnapshotCount: ordered.length,
      candleCount: candles.length,
      datasetSymbol: artifact.dataset.symbol,
      datasetTimeframe: artifact.dataset.timeframe,
      artifactDatasetCandleCount: artifact.dataset.candleCount,
      horizonBarsOverride:
        input.horizonBars === undefined ? null : input.horizonBars,
    },
    results,
  };
}

/** Exposed for deterministic ordering tests (artifact entry comparator). */
export { compareHistoricalMeasurementArtifactEntryOrder };
