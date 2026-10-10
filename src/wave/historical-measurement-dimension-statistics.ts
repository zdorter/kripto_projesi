import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifact } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import { resolveCrossOutcomeColumn } from "./historical-measurement-cross-statistics";
import { HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME } from "./historical-measurement-cross-statistics-types";
import {
  HISTORICAL_MEASUREMENT_DIMENSION_KEY_SEPARATOR,
  HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME,
  type HistoricalMeasurementDimensionSliceMap,
  type HistoricalMeasurementDimensionStatisticsBundle,
  type HistoricalMeasurementDimensionStatisticsReport,
  type HistoricalMeasurementDimensionStatisticsSlice,
  type HistoricalMeasurementSymbolTimeframeSetupFamilyTree,
} from "./historical-measurement-dimension-statistics-types";
import {
  HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID,
  HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS,
} from "./historical-measurement-rr-statistics-types";
import { resolveHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { selectHistoricalMeasurementEntries } from "./historical-measurement-statistics-filter";
import type { HistoricalMeasurementStatisticsFilter } from "./historical-measurement-statistics-filter-types";
import type { HistoricalMeasurementOutcomeDistribution } from "./historical-measurement-statistics-types";
import type { HistoricalMeasurementTradeEvaluationDistribution } from "./historical-measurement-statistics-types";
import type { HistoricalMeasurementRRBucketCounts } from "./historical-measurement-rr-statistics-types";

const OUTCOME_STATUSES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveHistoricalMeasurementDimensionSymbol(
  entry: HistoricalMeasurementArtifactEntry
): string {
  return isNonEmptyString(entry.symbol)
    ? entry.symbol
    : HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL;
}

export function resolveHistoricalMeasurementDimensionTimeframe(
  entry: HistoricalMeasurementArtifactEntry
): string {
  return isNonEmptyString(entry.timeframe)
    ? entry.timeframe
    : HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME;
}

export function resolveHistoricalMeasurementSetupFamily(
  entry: HistoricalMeasurementArtifactEntry
): string {
  const familyId = entry.evaluation.production?.familyId;
  return isNonEmptyString(familyId)
    ? familyId
    : HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY;
}

export function combineHistoricalMeasurementDimensionKeys(
  ...parts: string[]
): string {
  return parts.join(HISTORICAL_MEASUREMENT_DIMENSION_KEY_SEPARATOR);
}

function emptyOutcomeDistribution(): HistoricalMeasurementOutcomeDistribution {
  const base = Object.fromEntries(
    OUTCOME_STATUSES.map((s) => [s, 0])
  ) as { [K in ProspectiveSetupOutcomeReplayStatus]: number };
  return { ...base, nullOutcome: 0 };
}

function emptyTradeEvaluationDistribution(): HistoricalMeasurementTradeEvaluationDistribution {
  return {
    PASSED: 0,
    FAILED: 0,
    INSUFFICIENT_CONTEXT: 0,
  };
}

function emptyRrBucketCounts(): HistoricalMeasurementRRBucketCounts {
  const counts = {} as HistoricalMeasurementRRBucketCounts;
  for (const bucket of HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS) {
    counts[bucket] = 0;
  }
  counts[HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID] = 0;
  return counts;
}

export function emptyHistoricalMeasurementDimensionStatisticsSlice(): HistoricalMeasurementDimensionStatisticsSlice {
  return {
    totalSnapshots: 0,
    tradeEvaluation: emptyTradeEvaluationDistribution(),
    outcome: emptyOutcomeDistribution(),
    rrBucketCounts: emptyRrBucketCounts(),
  };
}

function incrementSliceWithEntry(
  slice: HistoricalMeasurementDimensionStatisticsSlice,
  entry: HistoricalMeasurementArtifactEntry
): void {
  slice.totalSnapshots += 1;

  const evalStatus = entry.evaluation.tradeEvaluation.status;
  slice.tradeEvaluation[evalStatus] += 1;

  const outcomeCol = resolveCrossOutcomeColumn(entry);
  if (outcomeCol === HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME) {
    slice.outcome.nullOutcome += 1;
  } else {
    slice.outcome[outcomeCol] += 1;
  }

  const rrRow = resolveHistoricalMeasurementRrBucketRow(entry);
  slice.rrBucketCounts[rrRow] += 1;
}

function getOrCreateSlice(
  map: Map<string, HistoricalMeasurementDimensionStatisticsSlice>,
  key: string
): HistoricalMeasurementDimensionStatisticsSlice {
  let slice = map.get(key);
  if (!slice) {
    slice = emptyHistoricalMeasurementDimensionStatisticsSlice();
    map.set(key, slice);
  }
  return slice;
}

function sortedSliceMap(
  map: Map<string, HistoricalMeasurementDimensionStatisticsSlice>
): HistoricalMeasurementDimensionSliceMap {
  const out: HistoricalMeasurementDimensionSliceMap = {};
  const keys = [...map.keys()].sort();
  for (const key of keys) {
    out[key] = map.get(key)!;
  }
  return out;
}

function sortedSymbolTimeframeSetupFamilyTree(
  treeMap: Map<
    string,
    Map<string, Map<string, HistoricalMeasurementDimensionStatisticsSlice>>
  >
): HistoricalMeasurementSymbolTimeframeSetupFamilyTree {
  const tree: HistoricalMeasurementSymbolTimeframeSetupFamilyTree = {};
  const symbols = [...treeMap.keys()].sort();
  for (const symbol of symbols) {
    const tfMap = treeMap.get(symbol)!;
    const timeframes = [...tfMap.keys()].sort();
    tree[symbol] = {};
    for (const timeframe of timeframes) {
      const famMap = tfMap.get(timeframe)!;
      const families = [...famMap.keys()].sort();
      tree[symbol][timeframe] = {};
      for (const family of families) {
        tree[symbol][timeframe][family] = famMap.get(family)!;
      }
    }
  }
  return tree;
}

export function buildHistoricalMeasurementDimensionStatisticsBundleFromEntries(
  entries: readonly HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementDimensionStatisticsBundle {
  const global = emptyHistoricalMeasurementDimensionStatisticsSlice();
  const bySymbol = new Map<string, HistoricalMeasurementDimensionStatisticsSlice>();
  const byTimeframe = new Map<string, HistoricalMeasurementDimensionStatisticsSlice>();
  const bySetupFamily = new Map<
    string,
    HistoricalMeasurementDimensionStatisticsSlice
  >();
  const bySymbolTimeframe = new Map<
    string,
    HistoricalMeasurementDimensionStatisticsSlice
  >();
  const bySymbolSetupFamily = new Map<
    string,
    HistoricalMeasurementDimensionStatisticsSlice
  >();
  const byTimeframeSetupFamily = new Map<
    string,
    HistoricalMeasurementDimensionStatisticsSlice
  >();
  const stsfTree = new Map<
    string,
    Map<string, Map<string, HistoricalMeasurementDimensionStatisticsSlice>>
  >();

  for (const entry of entries) {
    const symbol = resolveHistoricalMeasurementDimensionSymbol(entry);
    const timeframe = resolveHistoricalMeasurementDimensionTimeframe(entry);
    const setupFamily = resolveHistoricalMeasurementSetupFamily(entry);

    incrementSliceWithEntry(global, entry);
    incrementSliceWithEntry(getOrCreateSlice(bySymbol, symbol), entry);
    incrementSliceWithEntry(getOrCreateSlice(byTimeframe, timeframe), entry);
    incrementSliceWithEntry(
      getOrCreateSlice(bySetupFamily, setupFamily),
      entry
    );

    incrementSliceWithEntry(
      getOrCreateSlice(
        bySymbolTimeframe,
        combineHistoricalMeasurementDimensionKeys(symbol, timeframe)
      ),
      entry
    );
    incrementSliceWithEntry(
      getOrCreateSlice(
        bySymbolSetupFamily,
        combineHistoricalMeasurementDimensionKeys(symbol, setupFamily)
      ),
      entry
    );
    incrementSliceWithEntry(
      getOrCreateSlice(
        byTimeframeSetupFamily,
        combineHistoricalMeasurementDimensionKeys(timeframe, setupFamily)
      ),
      entry
    );

    let tfLevel = stsfTree.get(symbol);
    if (!tfLevel) {
      tfLevel = new Map();
      stsfTree.set(symbol, tfLevel);
    }
    let famLevel = tfLevel.get(timeframe);
    if (!famLevel) {
      famLevel = new Map();
      tfLevel.set(timeframe, famLevel);
    }
    incrementSliceWithEntry(getOrCreateSlice(famLevel, setupFamily), entry);
  }

  return {
    global,
    bySymbol: sortedSliceMap(bySymbol),
    byTimeframe: sortedSliceMap(byTimeframe),
    bySetupFamily: sortedSliceMap(bySetupFamily),
    bySymbolTimeframe: sortedSliceMap(bySymbolTimeframe),
    bySymbolSetupFamily: sortedSliceMap(bySymbolSetupFamily),
    byTimeframeSetupFamily: sortedSliceMap(byTimeframeSetupFamily),
    symbolTimeframeSetupFamily: sortedSymbolTimeframeSetupFamilyTree(stsfTree),
  };
}

export function sumDimensionSliceMapTotals(
  map: HistoricalMeasurementDimensionSliceMap
): number {
  let sum = 0;
  for (const key of Object.keys(map).sort()) {
    sum += map[key].totalSnapshots;
  }
  return sum;
}

export function sumSymbolTimeframeSetupFamilyLeafTotals(
  tree: HistoricalMeasurementSymbolTimeframeSetupFamilyTree
): number {
  let sum = 0;
  for (const symbol of Object.keys(tree).sort()) {
    for (const timeframe of Object.keys(tree[symbol]).sort()) {
      for (const family of Object.keys(tree[symbol][timeframe]).sort()) {
        sum += tree[symbol][timeframe][family].totalSnapshots;
      }
    }
  }
  return sum;
}

function buildCohortDimensionBundle(
  artifact: HistoricalMeasurementArtifact,
  cohort: HistoricalMeasurementCohort
): HistoricalMeasurementDimensionStatisticsBundle {
  const entries = selectHistoricalMeasurementEntries(artifact, {
    cohorts: [cohort],
  });
  return buildHistoricalMeasurementDimensionStatisticsBundleFromEntries(entries);
}

/**
 * B-9e: Symbol × Timeframe × Setup Family descriptive statistics (counts only).
 */
export function aggregateHistoricalMeasurementDimensionStatistics(
  artifact: HistoricalMeasurementArtifact,
  filter: HistoricalMeasurementStatisticsFilter = {}
): HistoricalMeasurementDimensionStatisticsReport {
  const entries = selectHistoricalMeasurementEntries(artifact, filter);
  const dimensions =
    buildHistoricalMeasurementDimensionStatisticsBundleFromEntries(entries);

  const cohorts =
    {} as HistoricalMeasurementDimensionStatisticsReport["cohorts"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    cohorts[cohort] = buildCohortDimensionBundle(artifact, cohort);
  }

  return {
    statisticsSchemaVersion:
      HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION,
    filter: {
      cohorts: filter.cohorts ? [...filter.cohorts] : undefined,
    },
    dimensions,
    cohorts,
  };
}
