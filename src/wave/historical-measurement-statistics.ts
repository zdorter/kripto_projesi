import { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import {
  HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION,
  type HistoricalMeasurementOutcomeDistribution,
  type HistoricalMeasurementStatisticsReport,
  type HistoricalMeasurementTradeEvaluationDistribution,
} from "./historical-measurement-statistics-types";

const OUTCOME_STATUSES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

const TRADE_EVAL_STATUSES: readonly TradeEvaluationStatus[] = [
  "PASSED",
  "FAILED",
  "INSUFFICIENT_CONTEXT",
];

function emptyOutcomeDistribution(): HistoricalMeasurementOutcomeDistribution {
  const base = Object.fromEntries(
    OUTCOME_STATUSES.map((s) => [s, 0])
  ) as { [K in ProspectiveSetupOutcomeReplayStatus]: number };
  return { ...base, nullOutcome: 0 };
}

function emptyTradeEvaluationDistribution(): HistoricalMeasurementTradeEvaluationDistribution {
  return Object.fromEntries(
    TRADE_EVAL_STATUSES.map((s) => [s, 0])
  ) as HistoricalMeasurementTradeEvaluationDistribution;
}

function isCountableId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isPathMeasuredOutcome(
  outcome: ProspectiveSetupOutcomeReplayStatus | null
): boolean {
  if (outcome === null) {
    return false;
  }
  return outcome !== "NO_FUTURE_DATA" && outcome !== "INSUFFICIENT_CONTEXT";
}

function resolveReplayOutcome(
  entry: HistoricalMeasurementArtifactEntry
): ProspectiveSetupOutcomeReplayStatus | null {
  if (entry.outcome === null) {
    return null;
  }
  return entry.outcome.replay.outcome;
}

function resolveSourceSetupId(entry: HistoricalMeasurementArtifactEntry): string | null {
  const id = entry.evaluation.production?.sourceSetupId;
  return isCountableId(id) ? id : null;
}

/**
 * Deterministic core statistics from a frozen B-8 artifact (read-only).
 */
export function aggregateHistoricalMeasurementStatistics(
  artifact: HistoricalMeasurementArtifact
): HistoricalMeasurementStatisticsReport {
  const outcome = emptyOutcomeDistribution();
  const tradeEvaluation = emptyTradeEvaluationDistribution();
  let pathMeasured = 0;
  let pathUnmeasured = 0;

  const prospectiveIds = new Set<string>();
  const sourceSetupIds = new Set<string>();

  for (const entry of artifact.measurements) {
    if (isCountableId(entry.prospectiveSetupId)) {
      prospectiveIds.add(entry.prospectiveSetupId);
    }
    const sourceId = resolveSourceSetupId(entry);
    if (sourceId) {
      sourceSetupIds.add(sourceId);
    }

    const replayOutcome = resolveReplayOutcome(entry);
    if (replayOutcome === null) {
      outcome.nullOutcome += 1;
      pathUnmeasured += 1;
    } else {
      outcome[replayOutcome] += 1;
      if (isPathMeasuredOutcome(replayOutcome)) {
        pathMeasured += 1;
      } else {
        pathUnmeasured += 1;
      }
    }

    const status = entry.evaluation.tradeEvaluation.status;
    tradeEvaluation[status] += 1;
  }

  return {
    statisticsSchemaVersion: HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION,
    input: {
      measurementSchemaVersion: artifact.schemaVersion,
    },
    sample: {
      totalSnapshots: artifact.measurements.length,
      uniqueProspectiveSetupIds: prospectiveIds.size,
      uniqueSourceSetupIds: sourceSetupIds.size,
    },
    distributions: {
      outcome,
      tradeEvaluation,
    },
    dataQuality: {
      pathMeasured,
      pathUnmeasured,
    },
  };
}

/** Zero report for empty measurement lists (deterministic). */
export function emptyHistoricalMeasurementStatisticsReport(
  measurementSchemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION = HISTORICAL_MEASUREMENT_SCHEMA_VERSION
): HistoricalMeasurementStatisticsReport {
  return aggregateHistoricalMeasurementStatistics({
    schemaVersion: measurementSchemaVersion,
    dataset: {
      symbol: "",
      timeframe: "",
      candleCount: 0,
      startEvaluationBar: null,
      endEvaluationBar: null,
      horizonBars: 0,
      rangeError: null,
    },
    measurements: [],
  });
}
