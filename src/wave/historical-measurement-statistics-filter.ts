import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import { aggregateHistoricalMeasurementStatistics } from "./historical-measurement-statistics";
import type { HistoricalMeasurementStatisticsReport } from "./historical-measurement-statistics-types";
import {
  HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION,
  type HistoricalMeasurementCohortStatisticsSlice,
  type HistoricalMeasurementDenominators,
  type HistoricalMeasurementFilteredStatisticsReport,
  type HistoricalMeasurementStatisticRate,
  type HistoricalMeasurementStatisticsFilter,
  type HistoricalMeasurementStatisticsRates,
  type HistoricalMeasurementDenominatorId,
} from "./historical-measurement-statistics-filter-types";

export function measurementMatchesCohortFilter(
  entry: HistoricalMeasurementArtifactEntry,
  filter: HistoricalMeasurementStatisticsFilter
): boolean {
  const cohorts = filter.cohorts;
  if (!cohorts || cohorts.length === 0) {
    return true;
  }
  return cohorts.some((c) => entry.cohorts.includes(c));
}

export function selectHistoricalMeasurementEntries(
  artifact: HistoricalMeasurementArtifact,
  filter: HistoricalMeasurementStatisticsFilter
): HistoricalMeasurementArtifactEntry[] {
  return artifact.measurements.filter((entry) =>
    measurementMatchesCohortFilter(entry, filter)
  );
}

function artifactWithMeasurements(
  artifact: HistoricalMeasurementArtifact,
  measurements: HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementArtifact {
  return {
    schemaVersion: artifact.schemaVersion,
    dataset: artifact.dataset,
    measurements,
  };
}

export function computeHistoricalMeasurementStatisticRate(
  numerator: number,
  denominator: number,
  denominatorId: HistoricalMeasurementDenominatorId
): HistoricalMeasurementStatisticRate {
  return {
    numerator,
    denominator,
    denominatorId,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

export function buildDenominatorsFromCore(
  totalSnapshots: number,
  filteredSnapshots: number,
  core: HistoricalMeasurementStatisticsReport
): HistoricalMeasurementDenominators {
  const measurablePaths = core.dataQuality.pathMeasured;
  const unmeasurablePaths = core.dataQuality.pathUnmeasured;
  const passed = core.distributions.tradeEvaluation.PASSED;
  const failed = core.distributions.tradeEvaluation.FAILED;
  const insufficient = core.distributions.tradeEvaluation.INSUFFICIENT_CONTEXT;

  return {
    totalSnapshots,
    filteredSnapshots,
    measurablePaths,
    unmeasurablePaths,
    tradeEvaluated: filteredSnapshots,
    tradeEvaluationPassed: passed,
    tradeEvaluationFailed: failed,
    tradeEvaluationInsufficientContext: insufficient,
    outcomeMeasured: measurablePaths,
    outcomeUnmeasured: unmeasurablePaths,
  };
}

export function buildRatesFromDenominatorsAndCore(
  denominators: HistoricalMeasurementDenominators,
  core: HistoricalMeasurementStatisticsReport
): HistoricalMeasurementStatisticsRates {
  return {
    tradeEvaluationPassRate: computeHistoricalMeasurementStatisticRate(
      core.distributions.tradeEvaluation.PASSED,
      denominators.tradeEvaluated,
      "TRADE_EVALUATED"
    ),
    outcomeMeasuredRate: computeHistoricalMeasurementStatisticRate(
      denominators.outcomeMeasured,
      denominators.filteredSnapshots,
      "FILTERED_SNAPSHOTS"
    ),
  };
}

function buildCohortSlice(
  artifact: HistoricalMeasurementArtifact,
  cohort: HistoricalMeasurementCohort,
  totalSnapshots: number
): HistoricalMeasurementCohortStatisticsSlice {
  const filter: HistoricalMeasurementStatisticsFilter = { cohorts: [cohort] };
  const entries = selectHistoricalMeasurementEntries(artifact, filter);
  const core = aggregateHistoricalMeasurementStatistics(
    artifactWithMeasurements(artifact, entries)
  );
  const denominators = buildDenominatorsFromCore(
    totalSnapshots,
    entries.length,
    core
  );
  const rates = buildRatesFromDenominatorsAndCore(denominators, core);
  return { denominators, core, rates };
}

/**
 * B-9b: filter (cohort OR) + denominators + rates + per-cohort slices on frozen artifact.
 */
export function aggregateHistoricalMeasurementStatisticsFiltered(
  artifact: HistoricalMeasurementArtifact,
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementFilteredStatisticsReport {
  const totalSnapshots = artifact.measurements.length;
  const entries = selectHistoricalMeasurementEntries(artifact, filter);
  const core = aggregateHistoricalMeasurementStatistics(
    artifactWithMeasurements(artifact, entries)
  );
  const denominators = buildDenominatorsFromCore(
    totalSnapshots,
    entries.length,
    core
  );
  const rates = buildRatesFromDenominatorsAndCore(denominators, core);

  const cohorts = {} as HistoricalMeasurementFilteredStatisticsReport["cohorts"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    cohorts[cohort] = buildCohortSlice(artifact, cohort, totalSnapshots);
  }

  return {
    statisticsSchemaVersion:
      HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION,
    filter: {
      cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
    },
    denominators,
    core,
    rates,
    cohorts,
  };
}
