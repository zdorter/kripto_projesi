import {
  sortHistoricalMeasurementArtifactEntries,
} from "./historical-measurement-artifact";
import {
  resolveHistoricalMeasurementDimensionSymbol,
  resolveHistoricalMeasurementDimensionTimeframe,
  resolveHistoricalMeasurementSetupFamily,
} from "./historical-measurement-dimension-statistics";
import { resolveHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import { classifyHistoricalPositionOutcomePolicy } from "./historical-position-outcome-policy";
import {
  HISTORICAL_POSITION_POLICY_CLASSIFICATIONS,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
  type HistoricalPositionOutcomePolicyId,
  type HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
import type { HistoricalPositionPathBatchResult } from "./historical-position-path-batch-types";
import {
  measurementMatchesCohortFilter,
  selectHistoricalMeasurementEntries,
} from "./historical-measurement-statistics-filter";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import {
  HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS,
  HISTORICAL_POSITION_OUTCOME_EVALUATION_ROWS,
  HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION,
  type HistoricalPositionOutcomeClassificationDistribution,
  type HistoricalPositionOutcomeCohortStatisticsMap,
  type HistoricalPositionOutcomeDenominators,
  type HistoricalPositionOutcomeDirectionSliceKey,
  type HistoricalPositionOutcomeDirectionStatisticsMap,
  type HistoricalPositionOutcomeEvaluationPolicyMatrix,
  type HistoricalPositionOutcomeRrBucketStatisticsMap,
  type HistoricalPositionOutcomeSetupFamilyStatisticsMap,
  type HistoricalPositionOutcomeStatisticRate,
  type HistoricalPositionOutcomeStatisticsCounts,
  type HistoricalPositionOutcomeStatisticsInput,
  type HistoricalPositionOutcomeStatisticsObservation,
  type HistoricalPositionOutcomeStatisticsRates,
  type HistoricalPositionOutcomeStatisticsReport,
  type HistoricalPositionOutcomeStatisticsSlice,
  type HistoricalPositionOutcomeSymbolStatisticsMap,
  type HistoricalPositionOutcomeTimeframeStatisticsMap,
} from "./historical-position-outcome-statistics-types";

export class HistoricalPositionOutcomeStatisticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalPositionOutcomeStatisticsValidationError";
  }
}

function normalizeFilter(
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementStatisticsFilter {
  return {
    cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
  };
}

function emptyClassificationDistribution(): HistoricalPositionOutcomeClassificationDistribution {
  return Object.fromEntries(
    HISTORICAL_POSITION_POLICY_CLASSIFICATIONS.map((c) => [c, 0])
  ) as HistoricalPositionOutcomeClassificationDistribution;
}

function emptyEvaluationCross(): HistoricalPositionOutcomeEvaluationPolicyMatrix {
  const matrix = {} as HistoricalPositionOutcomeEvaluationPolicyMatrix;
  for (const row of HISTORICAL_POSITION_OUTCOME_EVALUATION_ROWS) {
    matrix[row] = emptyClassificationDistribution();
  }
  return matrix;
}

export function emptyHistoricalPositionOutcomeStatisticsCounts(): HistoricalPositionOutcomeStatisticsCounts {
  return {
    totalSnapshots: 0,
    measuredPaths: 0,
    unmeasuredPaths: 0,
    favorableResolutions: 0,
    adverseResolutions: 0,
    inconclusiveSameBar: 0,
    unresolvedAtHorizon: 0,
    unmeasuredNoFuture: 0,
    unmeasuredInsufficient: 0,
    decisiveResolutions: 0,
    measuredNonDecisive: 0,
    wins: 0,
    losses: 0,
  };
}

export function computeHistoricalPositionOutcomeWinRateDecisive(
  favorableResolutions: number,
  adverseResolutions: number
): HistoricalPositionOutcomeStatisticRate {
  const denominator = favorableResolutions + adverseResolutions;
  return {
    numerator: favorableResolutions,
    denominator,
    denominatorId: "DECISIVE_RESOLUTIONS",
    value: denominator === 0 ? null : favorableResolutions / denominator,
  };
}

function buildDenominatorsFromCounts(
  counts: HistoricalPositionOutcomeStatisticsCounts
): HistoricalPositionOutcomeDenominators {
  return {
    filteredSnapshots: counts.totalSnapshots,
    measuredPaths: counts.measuredPaths,
    unmeasuredPaths: counts.unmeasuredPaths,
    decisiveResolutions: counts.decisiveResolutions,
    measuredNonDecisive: counts.measuredNonDecisive,
  };
}

function buildRatesFromCounts(
  counts: HistoricalPositionOutcomeStatisticsCounts
): HistoricalPositionOutcomeStatisticsRates {
  return {
    winRate_decisive: computeHistoricalPositionOutcomeWinRateDecisive(
      counts.favorableResolutions,
      counts.adverseResolutions
    ),
  };
}

function incrementClassificationCounts(
  counts: HistoricalPositionOutcomeStatisticsCounts,
  classification: HistoricalPositionPolicyClassification
): void {
  counts.totalSnapshots += 1;
  switch (classification) {
    case "FAVORABLE_RESOLUTION":
      counts.favorableResolutions += 1;
      counts.wins += 1;
      counts.decisiveResolutions += 1;
      counts.measuredPaths += 1;
      break;
    case "ADVERSE_RESOLUTION":
      counts.adverseResolutions += 1;
      counts.losses += 1;
      counts.decisiveResolutions += 1;
      counts.measuredPaths += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      counts.inconclusiveSameBar += 1;
      counts.measuredNonDecisive += 1;
      counts.measuredPaths += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      counts.unresolvedAtHorizon += 1;
      counts.measuredNonDecisive += 1;
      counts.measuredPaths += 1;
      break;
    case "UNMEASURED_NO_FUTURE":
      counts.unmeasuredNoFuture += 1;
      counts.unmeasuredPaths += 1;
      break;
    case "UNMEASURED_INSUFFICIENT":
      counts.unmeasuredInsufficient += 1;
      counts.unmeasuredPaths += 1;
      break;
    default:
      break;
  }
}

function resolveTradeEvaluationStatus(
  entry: HistoricalMeasurementArtifactEntry
): TradeEvaluationStatus {
  return entry.evaluation.tradeEvaluation.status;
}

export function resolveHistoricalPositionOutcomeDirectionSliceKey(
  entry: HistoricalMeasurementArtifactEntry
): HistoricalPositionOutcomeDirectionSliceKey {
  const observed = entry.evaluation.production?.observedDirection;
  if (observed === "BULLISH" || observed === "BEARISH") {
    return observed;
  }
  if (observed === "UNRESOLVED") {
    return "UNRESOLVED";
  }
  return "UNKNOWN";
}

type SliceAccumulator = {
  counts: HistoricalPositionOutcomeStatisticsCounts;
  classification: HistoricalPositionOutcomeClassificationDistribution;
  evaluationCross: HistoricalPositionOutcomeEvaluationPolicyMatrix;
};

function createSliceAccumulator(): SliceAccumulator {
  return {
    counts: emptyHistoricalPositionOutcomeStatisticsCounts(),
    classification: emptyClassificationDistribution(),
    evaluationCross: emptyEvaluationCross(),
  };
}

function finalizeSliceAccumulator(
  acc: SliceAccumulator
): HistoricalPositionOutcomeStatisticsSlice {
  return {
    counts: acc.counts,
    denominators: buildDenominatorsFromCounts(acc.counts),
    classification: acc.classification,
    rates: buildRatesFromCounts(acc.counts),
  };
}

function accumulateObservation(
  acc: SliceAccumulator,
  entry: HistoricalMeasurementArtifactEntry,
  classification: HistoricalPositionPolicyClassification
): void {
  incrementClassificationCounts(acc.counts, classification);
  acc.classification[classification] += 1;
  const evalStatus = resolveTradeEvaluationStatus(entry);
  acc.evaluationCross[evalStatus][classification] += 1;
}

function aggregateSliceFromObservations(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalPositionOutcomePolicyId
): { slice: HistoricalPositionOutcomeStatisticsSlice; evaluationCross: HistoricalPositionOutcomeEvaluationPolicyMatrix } {
  const acc = createSliceAccumulator();
  for (const observation of observations) {
    const { classification } = classifyHistoricalPositionOutcomePolicy(
      observation.pathResult,
      policyId
    );
    accumulateObservation(acc, observation.entry, classification);
  }
  return {
    slice: finalizeSliceAccumulator(acc),
    evaluationCross: acc.evaluationCross,
  };
}

function filterObservations(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  filter: HistoricalMeasurementStatisticsFilter
): HistoricalPositionOutcomeStatisticsObservation[] {
  return observations.filter((o) =>
    measurementMatchesCohortFilter(o.entry, filter)
  );
}

function buildDirectionStatistics(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalPositionOutcomePolicyId
): HistoricalPositionOutcomeDirectionStatisticsMap {
  const buckets = new Map<
    HistoricalPositionOutcomeDirectionSliceKey,
    HistoricalPositionOutcomeStatisticsObservation[]
  >();
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    buckets.set(key, []);
  }
  for (const observation of observations) {
    const key = resolveHistoricalPositionOutcomeDirectionSliceKey(
      observation.entry
    );
    buckets.get(key)!.push(observation);
  }
  const result = {} as HistoricalPositionOutcomeDirectionStatisticsMap;
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    result[key] = aggregateSliceFromObservations(
      buckets.get(key)!,
      policyId
    ).slice;
  }
  return result;
}

function buildKeyedStatistics(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalPositionOutcomePolicyId,
  resolveKey: (entry: HistoricalMeasurementArtifactEntry) => string
): Record<string, HistoricalPositionOutcomeStatisticsSlice> {
  const buckets = new Map<string, HistoricalPositionOutcomeStatisticsObservation[]>();
  for (const observation of observations) {
    const key = resolveKey(observation.entry);
    const list = buckets.get(key);
    if (list) {
      list.push(observation);
    } else {
      buckets.set(key, [observation]);
    }
  }
  const result: Record<string, HistoricalPositionOutcomeStatisticsSlice> = {};
  for (const [key, list] of buckets) {
    result[key] = aggregateSliceFromObservations(list, policyId).slice;
  }
  return result;
}

function buildRrBucketStatistics(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalPositionOutcomePolicyId
): HistoricalPositionOutcomeRrBucketStatisticsMap {
  const buckets = new Map<
    string,
    HistoricalPositionOutcomeStatisticsObservation[]
  >();
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    buckets.set(row, []);
  }
  for (const observation of observations) {
    const row = resolveHistoricalMeasurementRrBucketRow(observation.entry);
    buckets.get(row)!.push(observation);
  }
  const result = {} as HistoricalPositionOutcomeRrBucketStatisticsMap;
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    result[row] = aggregateSliceFromObservations(
      buckets.get(row)!,
      policyId
    ).slice;
  }
  return result;
}

/**
 * Align batch path results with filtered artifact entries (no path rerun).
 */
export function pairHistoricalPositionOutcomeObservationsWithBatch(
  artifact: HistoricalMeasurementArtifact,
  batch: HistoricalPositionPathBatchResult
): HistoricalPositionOutcomeStatisticsObservation[] {
  const filter = normalizeFilter(batch.filter);
  const selected = selectHistoricalMeasurementEntries(artifact, filter);
  const ordered = sortHistoricalMeasurementArtifactEntries([...selected]);
  if (ordered.length !== batch.results.length) {
    throw new HistoricalPositionOutcomeStatisticsValidationError(
      `Batch result count ${batch.results.length} does not match filtered entry count ${ordered.length}`
    );
  }
  return ordered.map((entry, index) => ({
    entry,
    pathResult: batch.results[index]!,
  }));
}

/**
 * B-10e: aggregate policy outcome statistics from precomputed path observations.
 */
export function aggregateHistoricalPositionOutcomeStatistics(
  input: HistoricalPositionOutcomeStatisticsInput
): HistoricalPositionOutcomeStatisticsReport {
  const filter = normalizeFilter(input.filter);
  const policyId =
    input.policyId ?? POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;
  const filtered = filterObservations(input.observations, filter);

  const overallAgg = aggregateSliceFromObservations(filtered, policyId);

  const cohorts = {} as HistoricalPositionOutcomeCohortStatisticsMap;
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    const cohortObs = filterObservations(input.observations, {
      cohorts: [cohort],
    });
    cohorts[cohort] = aggregateSliceFromObservations(
      cohortObs,
      policyId
    ).slice;
  }

  return {
    statisticsSchemaVersion:
      HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION,
    filter,
    policyId,
    totalArtifactSnapshots: input.totalArtifactSnapshots,
    overall: overallAgg.slice,
    evaluationCross: overallAgg.evaluationCross,
    cohorts,
    bySymbol: buildKeyedStatistics(
      filtered,
      policyId,
      resolveHistoricalMeasurementDimensionSymbol
    ) as HistoricalPositionOutcomeSymbolStatisticsMap,
    byTimeframe: buildKeyedStatistics(
      filtered,
      policyId,
      resolveHistoricalMeasurementDimensionTimeframe
    ) as HistoricalPositionOutcomeTimeframeStatisticsMap,
    bySetupFamily: buildKeyedStatistics(
      filtered,
      policyId,
      resolveHistoricalMeasurementSetupFamily
    ) as HistoricalPositionOutcomeSetupFamilyStatisticsMap,
    byDirection: buildDirectionStatistics(filtered, policyId),
    byRrBucket: buildRrBucketStatistics(filtered, policyId),
  };
}
