import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import { classifyHistoricalPositionOutcomePolicy } from "./historical-position-outcome-policy";
import {
  HISTORICAL_POSITION_POLICY_CLASSIFICATIONS,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
  type HistoricalPositionOutcomePolicyId,
  type HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_PATH_SCHEMA_VERSION } from "./historical-position-path-contract";
import { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "./historical-position-path-contract";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";
import {
  computeHistoricalPositionOutcomeWinRateDecisive,
  emptyHistoricalPositionOutcomeStatisticsCounts,
} from "./historical-position-outcome-statistics";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION,
  INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS,
  type IndependentTradeClassificationDistribution,
  type IndependentTradeCohortStatisticsMap,
  type IndependentTradeDenominators,
  type IndependentTradeDirectionStatisticsMap,
  type IndependentTradeDurationStatistics,
  type IndependentTradeEvaluationPolicyMatrix,
  type IndependentTradePathOutcomeDistribution,
  type IndependentTradeRrBucketStatisticsMap,
  type IndependentTradeSetupFamilyStatisticsMap,
  type IndependentTradeSnapshotReference,
  type IndependentTradeStatisticsCounts,
  type IndependentTradeStatisticsReport,
  type IndependentTradeStatisticsSlice,
  type IndependentTradeSymbolStatisticsMap,
  type IndependentTradeTimeframeStatisticsMap,
} from "./historical-independent-trade-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";

const PATH_OUTCOME_STATUSES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

export function computeIndependentTradeWinRateDecisive(
  favorableResolutions: number,
  adverseResolutions: number
): HistoricalPositionOutcomeStatisticRate {
  return computeHistoricalPositionOutcomeWinRateDecisive(
    favorableResolutions,
    adverseResolutions
  );
}

function emptyClassificationDistribution(): IndependentTradeClassificationDistribution {
  return Object.fromEntries(
    HISTORICAL_POSITION_POLICY_CLASSIFICATIONS.map((c) => [c, 0])
  ) as IndependentTradeClassificationDistribution;
}

function emptyPathOutcomeDistribution(): IndependentTradePathOutcomeDistribution {
  return Object.fromEntries(
    PATH_OUTCOME_STATUSES.map((s) => [s, 0])
  ) as IndependentTradePathOutcomeDistribution;
}

function emptyEvaluationCross(): IndependentTradeEvaluationPolicyMatrix {
  const matrix = {} as IndependentTradeEvaluationPolicyMatrix;
  for (const row of INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS) {
    matrix[row] = emptyClassificationDistribution();
  }
  return matrix;
}

export function emptyIndependentTradeStatisticsCounts(): IndependentTradeStatisticsCounts {
  const base = emptyHistoricalPositionOutcomeStatisticsCounts();
  return {
    totalTrades: 0,
    measuredTrades: 0,
    unmeasuredTrades: 0,
    favorableResolutions: base.favorableResolutions,
    adverseResolutions: base.adverseResolutions,
    wins: base.wins,
    losses: base.losses,
    decisiveResolutions: base.decisiveResolutions,
    inconclusiveSameBar: base.inconclusiveSameBar,
    unresolvedAtHorizon: base.unresolvedAtHorizon,
    unmeasuredNoFuture: base.unmeasuredNoFuture,
    unmeasuredInsufficient: base.unmeasuredInsufficient,
    measuredNonDecisive: base.measuredNonDecisive,
    totalTradeObservations: 0,
  };
}

function incrementTradeClassificationCounts(
  counts: IndependentTradeStatisticsCounts,
  classification: HistoricalPositionPolicyClassification
): void {
  counts.totalTrades += 1;
  counts.totalTradeObservations += 1;
  switch (classification) {
    case "FAVORABLE_RESOLUTION":
      counts.favorableResolutions += 1;
      counts.wins += 1;
      counts.decisiveResolutions += 1;
      counts.measuredTrades += 1;
      break;
    case "ADVERSE_RESOLUTION":
      counts.adverseResolutions += 1;
      counts.losses += 1;
      counts.decisiveResolutions += 1;
      counts.measuredTrades += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      counts.inconclusiveSameBar += 1;
      counts.measuredNonDecisive += 1;
      counts.measuredTrades += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      counts.unresolvedAtHorizon += 1;
      counts.measuredNonDecisive += 1;
      counts.measuredTrades += 1;
      break;
    case "UNMEASURED_NO_FUTURE":
      counts.unmeasuredNoFuture += 1;
      counts.unmeasuredTrades += 1;
      break;
    case "UNMEASURED_INSUFFICIENT":
      counts.unmeasuredInsufficient += 1;
      counts.unmeasuredTrades += 1;
      break;
    default:
      break;
  }
}

function buildDenominatorsFromCounts(
  counts: IndependentTradeStatisticsCounts
): IndependentTradeDenominators {
  return {
    filteredTrades: counts.totalTrades,
    measuredTrades: counts.measuredTrades,
    unmeasuredTrades: counts.unmeasuredTrades,
    decisiveResolutions: counts.decisiveResolutions,
    measuredNonDecisive: counts.measuredNonDecisive,
  };
}

function buildRatesFromCounts(
  counts: IndependentTradeStatisticsCounts
): IndependentTradeStatisticsSlice["rates"] {
  return {
    winRate_decisive: computeIndependentTradeWinRateDecisive(
      counts.favorableResolutions,
      counts.adverseResolutions
    ),
  };
}

type SliceAccumulator = {
  counts: IndependentTradeStatisticsCounts;
  classification: IndependentTradeClassificationDistribution;
  evaluationCross: IndependentTradeEvaluationPolicyMatrix;
};

function createSliceAccumulator(): SliceAccumulator {
  return {
    counts: emptyIndependentTradeStatisticsCounts(),
    classification: emptyClassificationDistribution(),
    evaluationCross: emptyEvaluationCross(),
  };
}

function finalizeSliceAccumulator(
  acc: SliceAccumulator
): IndependentTradeStatisticsSlice {
  return {
    counts: acc.counts,
    denominators: buildDenominatorsFromCounts(acc.counts),
    classification: acc.classification,
    rates: buildRatesFromCounts(acc.counts),
  };
}

function resolveTradeEvaluationStatus(
  trade: IndependentTradeUnit
): TradeEvaluationStatus {
  const status = trade.tradeEvaluationStatus;
  if (
    status === "PASSED" ||
    status === "FAILED" ||
    status === "INSUFFICIENT_CONTEXT"
  ) {
    return status;
  }
  return "INSUFFICIENT_CONTEXT";
}

export function resolveIndependentTradeDirectionSliceKey(
  trade: IndependentTradeUnit
): HistoricalPositionOutcomeDirectionSliceKey {
  if (trade.direction === "BULLISH" || trade.direction === "BEARISH") {
    return trade.direction;
  }
  if (trade.direction === null) {
    return "UNKNOWN";
  }
  return "UNKNOWN";
}

function pathResultFromTrade(trade: IndependentTradeUnit): HistoricalPositionPathResult {
  const outcome = trade.pathOutcome;
  return {
    schemaVersion: HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    snapshotId: trade.snapshotId,
    outcome,
    b6ReplayOutcome: outcome,
    evaluationBarIndex: trade.evaluationBarIndex,
    horizonBars: 0,
    futureBarsAvailable: 0,
    resolutionBarIndex: trade.resolutionBarIndex,
    barsAfterEvaluation: trade.barsAfterEvaluation,
    targetTouched:
      outcome === "TARGET_TOUCHED" || outcome === "AMBIGUOUS",
    invalidationTouched:
      outcome === "INVALIDATION_TOUCHED" || outcome === "AMBIGUOUS",
    direction: trade.direction,
    entryReferencePrice: trade.entryReferencePrice,
    targetReferencePrice: trade.targetReferencePrice,
    invalidationReferencePrice: trade.invalidationReferencePrice,
    limitations: [],
  };
}

function resolveTradePolicyClassification(
  trade: IndependentTradeUnit,
  policyId: HistoricalPositionOutcomePolicyId
): HistoricalPositionPolicyClassification {
  const { classification } = classifyHistoricalPositionOutcomePolicy(
    pathResultFromTrade(trade),
    policyId
  );
  return classification;
}

function accumulateTrade(
  acc: SliceAccumulator,
  trade: IndependentTradeUnit,
  policyId: HistoricalPositionOutcomePolicyId
): void {
  const classification = resolveTradePolicyClassification(trade, policyId);
  incrementTradeClassificationCounts(acc.counts, classification);
  acc.classification[classification] += 1;
  const evalStatus = resolveTradeEvaluationStatus(trade);
  acc.evaluationCross[evalStatus][classification] += 1;
}

function aggregateTradesSlice(
  trades: readonly IndependentTradeUnit[],
  policyId: HistoricalPositionOutcomePolicyId
): {
  slice: IndependentTradeStatisticsSlice;
  evaluationCross: IndependentTradeEvaluationPolicyMatrix;
} {
  const acc = createSliceAccumulator();
  for (const trade of trades) {
    accumulateTrade(acc, trade, policyId);
  }
  return {
    slice: finalizeSliceAccumulator(acc),
    evaluationCross: acc.evaluationCross,
  };
}

function tradeMatchesCohort(
  trade: IndependentTradeUnit,
  cohort: HistoricalMeasurementCohort
): boolean {
  return trade.snapshotCohorts.includes(cohort);
}

function sortRecordKeys<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key]!;
  }
  return sorted;
}

function buildDurationStatistics(
  trades: readonly IndependentTradeUnit[]
): IndependentTradeDurationStatistics {
  const durations = trades
    .map((t) => t.lifecycleDurationBars)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  if (!durations.length) {
    return {
      sampleCount: 0,
      minDurationBars: null,
      maxDurationBars: null,
      averageDurationBars: null,
      medianDurationBars: null,
    };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    sampleCount: sorted.length,
    minDurationBars: sorted[0]!,
    maxDurationBars: sorted[sorted.length - 1]!,
    averageDurationBars: sum / sorted.length,
    medianDurationBars: median,
  };
}

function buildPathOutcomeDistribution(
  trades: readonly IndependentTradeUnit[]
): IndependentTradePathOutcomeDistribution {
  const dist = emptyPathOutcomeDistribution();
  for (const trade of trades) {
    dist[trade.pathOutcome] += 1;
  }
  return dist;
}

function buildSnapshotReference(
  summary: IndependentTradeLifecycleReport["summary"]
): IndependentTradeSnapshotReference {
  return {
    totalSnapshots: summary.totalSnapshots,
    eligibleEntrySnapshots: summary.eligibleEntrySnapshots,
    independentTrades: summary.independentTrades,
    measuredTrades: summary.measuredTrades,
    unmeasuredSnapshots: summary.unmeasuredSnapshots,
    rejectedByMutex: summary.rejectedByMutex,
    overlappingSnapshotsEliminated: summary.overlappingSnapshotsEliminated,
  };
}

export function emptyIndependentTradeStatisticsReport(
  lifecycleReport: IndependentTradeLifecycleReport
): IndependentTradeStatisticsReport {
  return aggregateIndependentTradeStatistics(lifecycleReport);
}

/**
 * B-12c: aggregate outcome statistics from B-12b independent trades only (O(trades)).
 */
export function aggregateIndependentTradeStatistics(
  lifecycleReport: IndependentTradeLifecycleReport
): IndependentTradeStatisticsReport {
  const policyId =
    lifecycleReport.configuration.outcomePolicyId ??
    POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;
  const trades = lifecycleReport.trades;

  const overallAgg = aggregateTradesSlice(trades, policyId);

  const cohorts = {} as IndependentTradeCohortStatisticsMap;
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    const cohortTrades = trades.filter((t) => tradeMatchesCohort(t, cohort));
    cohorts[cohort] = aggregateTradesSlice(cohortTrades, policyId).slice;
  }

  const symbolBuckets = new Map<string, IndependentTradeUnit[]>();
  const timeframeBuckets = new Map<string, IndependentTradeUnit[]>();
  const familyBuckets = new Map<string, IndependentTradeUnit[]>();

  for (const trade of trades) {
    const symList = symbolBuckets.get(trade.symbol) ?? [];
    symList.push(trade);
    symbolBuckets.set(trade.symbol, symList);

    const tfList = timeframeBuckets.get(trade.timeframe) ?? [];
    tfList.push(trade);
    timeframeBuckets.set(trade.timeframe, tfList);

    const fam = trade.setupFamilyId;
    const famList = familyBuckets.get(fam) ?? [];
    famList.push(trade);
    familyBuckets.set(fam, famList);
  }

  const bySymbol: IndependentTradeSymbolStatisticsMap = {};
  for (const key of [...symbolBuckets.keys()].sort()) {
    bySymbol[key] = aggregateTradesSlice(
      symbolBuckets.get(key)!,
      policyId
    ).slice;
  }

  const byTimeframe: IndependentTradeTimeframeStatisticsMap = {};
  for (const key of [...timeframeBuckets.keys()].sort()) {
    byTimeframe[key] = aggregateTradesSlice(
      timeframeBuckets.get(key)!,
      policyId
    ).slice;
  }

  const bySetupFamily: IndependentTradeSetupFamilyStatisticsMap = {};
  for (const key of [...familyBuckets.keys()].sort()) {
    bySetupFamily[key] = aggregateTradesSlice(
      familyBuckets.get(key)!,
      policyId
    ).slice;
  }

  const byDirection = {} as IndependentTradeDirectionStatisticsMap;
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    const bucket = trades.filter(
      (t) => resolveIndependentTradeDirectionSliceKey(t) === key
    );
    byDirection[key] = aggregateTradesSlice(bucket, policyId).slice;
  }

  const byRrBucket = {} as IndependentTradeRrBucketStatisticsMap;
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    const bucket = trades.filter(
      (t) => classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio) === row
    );
    byRrBucket[row] = aggregateTradesSlice(bucket, policyId).slice;
  }

  return {
    statisticsSchemaVersion: HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION,
    policyId,
    entryEventPolicyId: lifecycleReport.configuration.entryEventPolicyId,
    snapshotReference: buildSnapshotReference(lifecycleReport.summary),
    overall: overallAgg.slice,
    evaluationCross: overallAgg.evaluationCross,
    pathOutcomeDistribution: buildPathOutcomeDistribution(trades),
    duration: buildDurationStatistics(trades),
    cohorts,
    bySymbol: sortRecordKeys(bySymbol),
    byTimeframe: sortRecordKeys(byTimeframe),
    bySetupFamily: sortRecordKeys(bySetupFamily),
    byDirection,
    byRrBucket,
  };
}
