import { buildHistoricalMeasurementArtifact } from "./historical-measurement-artifact";
import {
  HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
} from "./setup/historical-measurement-contract";
import {
  aggregateHistoricalPositionOutcomeStatistics,
  pairHistoricalPositionOutcomeObservationsWithBatch,
} from "./historical-position-outcome-statistics";
import { HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION } from "./historical-position-outcome-policy-types";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "./historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION } from "./historical-position-outcome-statistics-types";
import { runHistoricalPositionPathBatch } from "./historical-position-path-batch";
import { HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION } from "./historical-position-path-batch-types";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import {
  HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION,
  type HistoricalBacktestConfiguration,
  type HistoricalBacktestReport,
  type RunHistoricalBacktestInput,
} from "./historical-backtest-types";

/**
 * B-10f end-to-end historical backtest (measurement → path → policy stats).
 * Complexity: O((end - start + 1) × candidates × compose) + O(filtered × path).
 * No PnL, execution, or live market access.
 */
export function runHistoricalBacktest(
  input: RunHistoricalBacktestInput
): HistoricalBacktestReport {
  const horizonBars =
    input.horizonBars ?? HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS;
  const filter: HistoricalMeasurementStatisticsFilter = input.filter
    ? { cohorts: input.filter.cohorts ? [...input.filter.cohorts] : undefined }
    : {};
  const policyId =
    input.policyId ?? POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;

  const artifact = buildHistoricalMeasurementArtifact({
    symbol: input.symbol,
    timeframeId: input.timeframeId,
    candles: [...input.candles],
    startEvaluationBar: input.startEvaluationBar,
    endEvaluationBar: input.endEvaluationBar,
    horizonBars,
    engineOptions: input.engineOptions,
  });

  const rangeError = artifact.dataset.rangeError;
  const evaluatedEvaluationBars =
    rangeError === null &&
    artifact.dataset.startEvaluationBar !== null &&
    artifact.dataset.endEvaluationBar !== null
      ? artifact.dataset.endEvaluationBar -
        artifact.dataset.startEvaluationBar +
        1
      : 0;

  const pathBatch = runHistoricalPositionPathBatch({
    artifact,
    candles: input.candles,
    filter,
    horizonBars,
  });

  const observations = rangeError === null
    ? pairHistoricalPositionOutcomeObservationsWithBatch(artifact, pathBatch)
    : [];

  const outcomeStatistics = aggregateHistoricalPositionOutcomeStatistics({
    totalArtifactSnapshots: artifact.measurements.length,
    observations,
    filter,
    policyId,
  });

  const configuration: HistoricalBacktestConfiguration = {
    symbol: input.symbol,
    timeframeId: input.timeframeId,
    candleCount: input.candles.length,
    startEvaluationBar: artifact.dataset.startEvaluationBar,
    endEvaluationBar: artifact.dataset.endEvaluationBar,
    horizonBars: artifact.dataset.horizonBars,
    policyId,
    filter,
    rangeError,
    measurementSchemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    policySchemaVersion: HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION,
    outcomeStatisticsSchemaVersion:
      HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION,
    pathBatchSchemaVersion: HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION,
    evaluatedEvaluationBars,
    totalArtifactSnapshots: artifact.measurements.length,
    filteredPathResults: pathBatch.results.length,
  };

  return {
    schemaVersion: HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION,
    configuration,
    artifact,
    pathBatch,
    outcomeStatistics,
  };
}
