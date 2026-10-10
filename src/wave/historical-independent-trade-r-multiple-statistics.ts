import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import {
  HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION,
  INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS,
  type IndependentTradeRMultipleRejectionReason,
} from "./historical-independent-trade-r-multiple-contract";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION,
  type AggregateIndependentTradeRMultipleStatisticsInput,
  type HistoricalIndependentTradeRMultipleStatisticsReport,
  type IndependentTradeRMultipleCohortMap,
  type IndependentTradeRMultipleDirectionMap,
  type IndependentTradeRMultipleEvaluationMap,
  type IndependentTradeRMultipleExitReasonMap,
  type IndependentTradeRMultipleOverallStatistics,
  type IndependentTradeRMultipleRejectionCounts,
  type IndependentTradeRMultipleRrBucketMap,
  type IndependentTradeRMultipleSetupFamilyMap,
  type IndependentTradeRMultipleSliceStatistics,
} from "./historical-independent-trade-r-multiple-statistics-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

const PATH_OUTCOME_STATUSES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

const EVALUATION_STATUSES: readonly Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>[] = ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export interface TheoreticalTradeRMultipleResult {
  /** Teorik R; yalnızca geçerli risk + decisive policy sonucu için. */
  theoreticalR: number | null;
  rejectionReasons: readonly IndependentTradeRMultipleRejectionReason[];
  riskAmount: number | null;
  rewardAmount: number | null;
  /** B-9d prospective RR (trade üzerinde donmuş); realized R ile karıştırılmamalı. */
  prospectiveRrRatio: number | null;
}

function isFinitePositive(n: number | null): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function emptyRejectionCounts(): IndependentTradeRMultipleRejectionCounts {
  return Object.fromEntries(
    INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS.map((r) => [r, 0])
  ) as IndependentTradeRMultipleRejectionCounts;
}

/**
 * B-12g: tek trade için teorik R (B-10d policyClassification kullanılır; policy yeniden yazılmaz).
 */
export function computeTheoreticalTradeRMultiple(
  trade: IndependentTradeUnit
): TheoreticalTradeRMultipleResult {
  const rejectionReasons: IndependentTradeRMultipleRejectionReason[] = [];
  const entry = trade.entryReferencePrice;
  const target = trade.targetReferencePrice;
  const invalidation = trade.invalidationReferencePrice;
  const direction = trade.direction;

  if (!isFinitePositive(entry)) {
    rejectionReasons.push("INVALID_ENTRY_REFERENCE");
  }
  if (!isFinitePositive(target)) {
    rejectionReasons.push("INVALID_TARGET_REFERENCE");
  }
  if (!isFinitePositive(invalidation)) {
    rejectionReasons.push("INVALID_INVALIDATION_REFERENCE");
  }
  if (direction !== "BULLISH" && direction !== "BEARISH") {
    rejectionReasons.push("INVALID_DIRECTION");
  }

  if (rejectionReasons.length > 0) {
    return {
      theoreticalR: null,
      rejectionReasons,
      riskAmount: null,
      rewardAmount: null,
      prospectiveRrRatio: trade.canonicalRrRatio,
    };
  }

  const e = entry!;
  const t = target!;
  const inv = invalidation!;
  const dir = direction!;

  let risk: number;
  let reward: number;
  if (dir === "BULLISH") {
    if (!(t > e && e > inv)) {
      rejectionReasons.push("INCONSISTENT_TARGET_DIRECTION");
    }
    risk = e - inv;
    reward = t - e;
  } else {
    if (!(inv > e && e > t)) {
      rejectionReasons.push("INCONSISTENT_TARGET_DIRECTION");
    }
    risk = inv - e;
    reward = e - t;
  }

  if (rejectionReasons.includes("INCONSISTENT_TARGET_DIRECTION")) {
    return {
      theoreticalR: null,
      rejectionReasons,
      riskAmount: risk,
      rewardAmount: reward,
      prospectiveRrRatio: trade.canonicalRrRatio,
    };
  }

  if (risk <= 0 || !Number.isFinite(risk)) {
    rejectionReasons.push("INVALID_RISK_REFERENCE");
    return {
      theoreticalR: null,
      rejectionReasons,
      riskAmount: risk <= 0 ? risk : risk,
      rewardAmount: reward,
      prospectiveRrRatio: trade.canonicalRrRatio,
    };
  }

  if (reward <= 0 || !Number.isFinite(reward)) {
    rejectionReasons.push("INCONSISTENT_TARGET_DIRECTION");
    return {
      theoreticalR: null,
      rejectionReasons,
      riskAmount: risk,
      rewardAmount: reward,
      prospectiveRrRatio: trade.canonicalRrRatio,
    };
  }

  const classification = trade.policyClassification;
  let theoreticalR: number | null = null;
  if (classification === "FAVORABLE_RESOLUTION") {
    theoreticalR = reward / risk;
  } else if (classification === "ADVERSE_RESOLUTION") {
    theoreticalR = -1;
  }

  return {
    theoreticalR,
    rejectionReasons,
    riskAmount: risk,
    rewardAmount: reward,
    prospectiveRrRatio: trade.canonicalRrRatio,
  };
}

function isDecisiveClassification(
  c: HistoricalPositionPolicyClassification
): boolean {
  return c === "FAVORABLE_RESOLUTION" || c === "ADVERSE_RESOLUTION";
}

type SliceAccumulator = {
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  sumR: number;
  rValues: number[];
  grossPositiveR: number;
  grossNegativeR: number;
  winRSum: number;
  winRCount: number;
  lossRSum: number;
  lossRCount: number;
};

function createSliceAccumulator(): SliceAccumulator {
  return {
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    sumR: 0,
    rValues: [],
    grossPositiveR: 0,
    grossNegativeR: 0,
    winRSum: 0,
    winRCount: 0,
    lossRSum: 0,
    lossRCount: 0,
  };
}

function accumulatePolicyOutcome(
  acc: SliceAccumulator,
  classification: HistoricalPositionPolicyClassification
): void {
  switch (classification) {
    case "FAVORABLE_RESOLUTION":
      acc.wins += 1;
      break;
    case "ADVERSE_RESOLUTION":
      acc.losses += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      acc.inconclusive += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      acc.unresolved += 1;
      break;
    default:
      break;
  }
}

function accumulateTheoreticalR(
  acc: SliceAccumulator,
  r: number,
  classification: HistoricalPositionPolicyClassification
): void {
  acc.sumR += r;
  acc.rValues.push(r);
  if (r > 0) {
    acc.grossPositiveR += r;
  } else if (r < 0) {
    acc.grossNegativeR += r;
  }
  if (classification === "FAVORABLE_RESOLUTION") {
    acc.winRSum += r;
    acc.winRCount += 1;
  } else if (classification === "ADVERSE_RESOLUTION") {
    acc.lossRSum += r;
    acc.lossRCount += 1;
  }
}

function median(sorted: readonly number[]): number | null {
  if (!sorted.length) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function finalizeSlice(acc: SliceAccumulator): IndependentTradeRMultipleSliceStatistics {
  const decisive = acc.wins + acc.losses;
  const winRate = computeIndependentTradeWinRateDecisive(acc.wins, acc.losses);
  const lossRate = computeIndependentTradeWinRateDecisive(acc.losses, acc.wins);
  const averageWinR = acc.wins === 0 ? null : acc.winRSum / acc.wins;
  const averageLossR = acc.losses === 0 ? null : acc.lossRSum / acc.losses;
  const expectancyR =
    decisive === 0 ? null : acc.sumR / decisive;
  const profitFactorR =
    acc.grossNegativeR === 0
      ? null
      : acc.grossPositiveR / Math.abs(acc.grossNegativeR);

  return {
    decisive,
    wins: acc.wins,
    losses: acc.losses,
    tradesWithTheoreticalR: acc.rValues.length,
    winRate,
    averageWinR,
    averageLossR,
    expectancyR,
    profitFactorR,
    sumR: acc.sumR,
    sampleSize: decisive,
  };
}

function resolveEvaluationStatus(
  trade: IndependentTradeUnit
): Extract<TradeEvaluationStatus, "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"> {
  const s = trade.tradeEvaluationStatus;
  if (s === "PASSED" || s === "FAILED" || s === "INSUFFICIENT_CONTEXT") {
    return s;
  }
  return "INSUFFICIENT_CONTEXT";
}

function sortRecordKeys<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key]!;
  }
  return sorted;
}

/**
 * B-12g: bağımsız trade lifecycle üzerinden teorik R-Multiple istatistikleri.
 * Path replay / evaluator / PnL yok.
 */
export function aggregateIndependentTradeRMultipleStatistics(
  input: AggregateIndependentTradeRMultipleStatisticsInput
): HistoricalIndependentTradeRMultipleStatisticsReport {
  const { lifecycleReport, statisticsReport } = input;
  const trades = lifecycleReport.trades;
  const policyId = lifecycleReport.configuration.outcomePolicyId;
  const entryEventPolicyId = lifecycleReport.configuration.entryEventPolicyId;

  const overallAcc = createSliceAccumulator();
  const rejectionCounts = emptyRejectionCounts();
  let validRiskTrades = 0;
  let invalidRiskTrades = 0;
  const rValuesOverall: number[] = [];
  let positiveRCount = 0;
  let negativeRCount = 0;
  let zeroRCount = 0;

  const directionAcc = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
      k,
      createSliceAccumulator(),
    ])
  ) as Record<
    (typeof HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS)[number],
    SliceAccumulator
  >;

  const rrAcc = Object.fromEntries(
    HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((k) => [k, createSliceAccumulator()])
  ) as Record<
    (typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number],
    SliceAccumulator
  >;

  const evalAcc = Object.fromEntries(
    EVALUATION_STATUSES.map((k) => [k, createSliceAccumulator()])
  ) as Record<
    (typeof EVALUATION_STATUSES)[number],
    SliceAccumulator
  >;

  const exitAcc = Object.fromEntries(
    PATH_OUTCOME_STATUSES.map((k) => [k, createSliceAccumulator()])
  ) as Record<
    (typeof PATH_OUTCOME_STATUSES)[number],
    SliceAccumulator
  >;

  const cohortAcc = Object.fromEntries(
    HISTORICAL_MEASUREMENT_COHORTS.map((k) => [k, createSliceAccumulator()])
  ) as Record<HistoricalMeasurementCohort, SliceAccumulator>;

  const familyAcc = new Map<string, SliceAccumulator>();

  for (const trade of trades) {
    const computed = computeTheoreticalTradeRMultiple(trade);
    const hasValidRisk = computed.rejectionReasons.length === 0;
    if (hasValidRisk) {
      validRiskTrades += 1;
    } else {
      invalidRiskTrades += 1;
      for (const reason of computed.rejectionReasons) {
        rejectionCounts[reason] += 1;
      }
    }

    const classification = trade.policyClassification;
    accumulatePolicyOutcome(overallAcc, classification);
    accumulatePolicyOutcome(
      directionAcc[resolveIndependentTradeDirectionSliceKey(trade)],
      classification
    );
    const rrKey = classifyHistoricalMeasurementRrBucketRow(
      trade.canonicalRrRatio
    );
    accumulatePolicyOutcome(rrAcc[rrKey], classification);
    accumulatePolicyOutcome(
      evalAcc[resolveEvaluationStatus(trade)],
      classification
    );
    accumulatePolicyOutcome(exitAcc[trade.pathOutcome], classification);

    for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
      if (trade.snapshotCohorts.includes(cohort)) {
        accumulatePolicyOutcome(cohortAcc[cohort], classification);
      }
    }

    const familyKey = trade.setupFamilyId;
    const fam = familyAcc.get(familyKey) ?? createSliceAccumulator();
    accumulatePolicyOutcome(fam, classification);
    familyAcc.set(familyKey, fam);

    if (computed.theoreticalR !== null) {
      const r = computed.theoreticalR;
      accumulateTheoreticalR(overallAcc, r, classification);
      accumulateTheoreticalR(
        directionAcc[resolveIndependentTradeDirectionSliceKey(trade)],
        r,
        classification
      );
      accumulateTheoreticalR(rrAcc[rrKey], r, classification);
      accumulateTheoreticalR(
        evalAcc[resolveEvaluationStatus(trade)],
        r,
        classification
      );
      accumulateTheoreticalR(exitAcc[trade.pathOutcome], r, classification);
      for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
        if (trade.snapshotCohorts.includes(cohort)) {
          accumulateTheoreticalR(cohortAcc[cohort], r, classification);
        }
      }
      accumulateTheoreticalR(fam, r, classification);

      rValuesOverall.push(r);
      if (r > 0) {
        positiveRCount += 1;
      } else if (r < 0) {
        negativeRCount += 1;
      } else {
        zeroRCount += 1;
      }
    }
  }

  const decisiveTrades = overallAcc.wins + overallAcc.losses;
  const sortedR = [...rValuesOverall].sort((a, b) => a - b);
  const winRateDecisive = computeIndependentTradeWinRateDecisive(
    overallAcc.wins,
    overallAcc.losses
  );
  const lossRateDecisive = computeIndependentTradeWinRateDecisive(
    overallAcc.losses,
    overallAcc.wins
  );
  const averageWinR =
    overallAcc.wins === 0 ? null : overallAcc.winRSum / overallAcc.wins;
  const averageLossR =
    overallAcc.losses === 0 ? null : overallAcc.lossRSum / overallAcc.losses;
  const expectancyR =
    decisiveTrades === 0 ? null : overallAcc.sumR / decisiveTrades;
  const averageR =
    rValuesOverall.length === 0
      ? null
      : overallAcc.sumR / rValuesOverall.length;
  const profitFactorR =
    overallAcc.grossNegativeR === 0
      ? null
      : overallAcc.grossPositiveR / Math.abs(overallAcc.grossNegativeR);

  const winRateValue = winRateDecisive.value;
  const lossRateValue = lossRateDecisive.value;
  let expectancyRFromWinLossComponents: number | null = null;
  if (decisiveTrades === 0) {
    expectancyRFromWinLossComponents = null;
  } else if (averageWinR !== null && averageLossR !== null) {
    expectancyRFromWinLossComponents =
      winRateValue! * averageWinR + lossRateValue! * averageLossR;
  }

  const overall: IndependentTradeRMultipleOverallStatistics = {
    totalTrades: trades.length,
    validRiskTrades,
    invalidRiskTrades,
    decisiveTrades,
    wins: overallAcc.wins,
    losses: overallAcc.losses,
    inconclusive: overallAcc.inconclusive,
    unresolved: overallAcc.unresolved,
    tradesWithTheoreticalR: rValuesOverall.length,
    decisiveWithoutTheoreticalR:
      decisiveTrades - rValuesOverall.length,
    sumR: overallAcc.sumR,
    averageR,
    medianR: median(sortedR),
    minR: sortedR.length ? sortedR[0]! : null,
    maxR: sortedR.length ? sortedR[sortedR.length - 1]! : null,
    positiveRCount,
    negativeRCount,
    zeroRCount,
    expectancyR,
    averageWinR,
    averageLossR,
    winRateDecisive,
    lossRateDecisive,
    profitFactorR,
    expectancyRFromWinLossComponents,
    rejectionCounts,
  };

  const snapshotReference = statisticsReport?.snapshotReference ?? {
    totalSnapshots: lifecycleReport.summary.totalSnapshots,
    eligibleEntrySnapshots: lifecycleReport.summary.eligibleEntrySnapshots,
    independentTrades: lifecycleReport.summary.independentTrades,
    measuredTrades: lifecycleReport.summary.measuredTrades,
    unmeasuredSnapshots: lifecycleReport.summary.unmeasuredSnapshots,
    rejectedByMutex: lifecycleReport.summary.rejectedByMutex,
    overlappingSnapshotsEliminated:
      lifecycleReport.summary.overlappingSnapshotsEliminated,
  };

  if (statisticsReport) {
    assertStatisticsParity(statisticsReport, overall);
  }

  const bySetupFamily: IndependentTradeRMultipleSetupFamilyMap = sortRecordKeys(
    Object.fromEntries(
      [...familyAcc.entries()].map(([k, acc]) => [k, finalizeSlice(acc)])
    )
  );

  return {
    schemaVersion:
      HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION,
    rMultipleContractVersion:
      HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION,
    policyId,
    entryEventPolicyId,
    populationKind: "INDEPENDENT_TRADE_THEORETICAL_R_MULTIPLE",
    snapshotReference,
    analysisScopeNote:
      "Historical theoretical R performance only; not realized PnL, fees, slippage, or tradeability.",
    prospectiveVsRealizedRNote:
      "canonicalRrRatio is B-9d prospective RR at entry; theoretical R is outcome-based (WIN: reward/risk, LOSS: -1R).",
    overall,
    byDirection: Object.fromEntries(
      HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
        k,
        finalizeSlice(directionAcc[k]),
      ])
    ) as IndependentTradeRMultipleDirectionMap,
    byRrBucket: Object.fromEntries(
      HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((k) => [
        k,
        finalizeSlice(rrAcc[k]),
      ])
    ) as IndependentTradeRMultipleRrBucketMap,
    bySetupFamily,
    byEvaluation: Object.fromEntries(
      EVALUATION_STATUSES.map((k) => [k, finalizeSlice(evalAcc[k])])
    ) as IndependentTradeRMultipleEvaluationMap,
    byExitReason: Object.fromEntries(
      PATH_OUTCOME_STATUSES.map((k) => [k, finalizeSlice(exitAcc[k])])
    ) as IndependentTradeRMultipleExitReasonMap,
    byCohort: Object.fromEntries(
      HISTORICAL_MEASUREMENT_COHORTS.map((k) => [
        k,
        finalizeSlice(cohortAcc[k]),
      ])
    ) as IndependentTradeRMultipleCohortMap,
  };
}

function assertStatisticsParity(
  statisticsReport: IndependentTradeStatisticsReport,
  overall: IndependentTradeRMultipleOverallStatistics
): void {
  const c = statisticsReport.overall.counts;
  if (
    c.wins !== overall.wins ||
    c.losses !== overall.losses ||
    c.decisiveResolutions !== overall.decisiveTrades ||
    c.inconclusiveSameBar !== overall.inconclusive ||
    c.unresolvedAtHorizon !== overall.unresolved ||
    c.totalTrades !== overall.totalTrades
  ) {
    throw new Error(
      "B-12g outcome counts diverge from B-12c statisticsReport (parity guard)"
    );
  }
}
