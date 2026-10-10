import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import { mapAuditGeometryToEntryReferenceQuality } from "./historical-entry-reference-quality-analysis";
import { classifyTheoreticalRGeometryForAudit } from "./historical-independent-trade-r-eligibility-audit";
import {
  EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED,
  EVALUATOR_FAILURE_REASON_CONTRACT_NOTES,
  EVALUATOR_FAILURE_REASON_INSUFFICIENT_CONTEXT_BUCKET,
  EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
  EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
  HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
  type EvaluatorFailureReasonAnalysisBucket,
} from "./historical-evaluator-failure-reason-contract";
import { computeTheoreticalTradeRMultiple } from "./historical-independent-trade-r-multiple-statistics";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS,
  type BuildHistoricalEvaluatorFailureReasonAnalysisInput,
  type EvaluatorFailureReasonFailedSlice,
  type EvaluatorFailureReasonOverallSlice,
  type EvaluatorFailureReasonOutcomeCounts,
  type HistoricalEvaluatorFailureReasonAnalysisReport,
} from "./historical-evaluator-failure-reason-analysis-types";

const WARNINGS: readonly string[] = [
  "observational_analysis",
  "no_causal_inference",
  "failure_reason_is_frozen_metadata",
  "evaluator_rules_not_changed",
  "path_outcome_is_independent",
  "no_execution_simulation",
  "no_pnl",
  "no_fees",
  "no_slippage",
  "temporal_dependence",
  "overlapping_historical_observations",
];

type Acc = {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
};

function emptyAcc(): Acc {
  return {
    total: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    unmeasured: 0,
  };
}

function accumulate(acc: Acc, c: HistoricalPositionPolicyClassification): void {
  acc.total += 1;
  switch (c) {
    case "FAVORABLE_RESOLUTION":
      acc.wins += 1;
      acc.decisive += 1;
      break;
    case "ADVERSE_RESOLUTION":
      acc.losses += 1;
      acc.decisive += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      acc.inconclusive += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      acc.unresolved += 1;
      break;
    case "UNMEASURED_NO_FUTURE":
    case "UNMEASURED_INSUFFICIENT":
      acc.unmeasured += 1;
      break;
    default:
      break;
  }
}

function geometryForTrade(trade: IndependentTradeUnit): EntryReferenceGeometryQuality {
  const computed = computeTheoreticalTradeRMultiple(trade);
  return mapAuditGeometryToEntryReferenceQuality(
    classifyTheoreticalRGeometryForAudit(trade, computed)
  );
}

function resolveDurationBucket(
  durationBars: number | null
): IndependentTradeDurationBucketId | null {
  if (durationBars === null || !Number.isFinite(durationBars)) {
    return null;
  }
  const d = Math.floor(durationBars);
  if (d >= 1 && d <= 3) {
    return "DURATION_1_3";
  }
  if (d >= 4 && d <= 6) {
    return "DURATION_4_6";
  }
  if (d >= 7 && d <= 12) {
    return "DURATION_7_12";
  }
  if (d >= 13 && d <= 24) {
    return "DURATION_13_24";
  }
  return null;
}

export function resolveEvaluatorFailureReasonBucket(
  trade: IndependentTradeUnit
): EvaluatorFailureReasonAnalysisBucket | null {
  if (trade.tradeEvaluationStatus === "FAILED") {
    return trade.evaluatorFirstFailure ?? EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED;
  }
  return null;
}

function accToOverall(
  reason: EvaluatorFailureReasonAnalysisBucket,
  acc: Acc
): EvaluatorFailureReasonOverallSlice {
  return {
    failureReason: reason,
    totalTrades: acc.total,
    decisiveTrades: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    unmeasuredTrades: acc.unmeasured,
    decisiveWinRate: computeIndependentTradeWinRateDecisive(acc.wins, acc.losses),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
  };
}

function aggregateLifecycleOutcomes(trades: readonly IndependentTradeUnit[]) {
  const acc = emptyAcc();
  for (const t of trades) {
    accumulate(acc, t.policyClassification);
  }
  return acc;
}

/**
 * B-12l: frozen firstFailure teşhis analizi (lifecycle-only; evaluator çağrılmaz).
 */
export function buildHistoricalEvaluatorFailureReasonAnalysis(
  input: BuildHistoricalEvaluatorFailureReasonAnalysisInput
): HistoricalEvaluatorFailureReasonAnalysisReport {
  const { lifecycleReport, statisticsReport } = input;
  const trades = lifecycleReport.trades;

  const overallAcc = aggregateLifecycleOutcomes(trades);

  const byReason = new Map<EvaluatorFailureReasonAnalysisBucket, Acc>();
  const outcomeByReason = new Map<EvaluatorFailureReasonAnalysisBucket, Acc>();

  const dimDirection = new Map<
    string,
    Map<EvaluatorFailureReasonAnalysisBucket, Acc>
  >();
  const dimRr = new Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>();
  const dimFamily = new Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>();
  const dimGeometry = new Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>();
  const dimExit = new Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>();
  const dimDuration = new Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>();

  const bumpDim = (
    store: Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>,
    dimKey: string,
    reason: EvaluatorFailureReasonAnalysisBucket,
    c: HistoricalPositionPolicyClassification
  ) => {
    let byR = store.get(dimKey);
    if (!byR) {
      byR = new Map();
      store.set(dimKey, byR);
    }
    const acc = byR.get(reason) ?? emptyAcc();
    accumulate(acc, c);
    byR.set(reason, acc);
  };

  let failedMissing = 0;
  let insufficientContext = 0;

  const passedAcc = emptyAcc();
  let totalFailedWins = 0;
  let totalFailedDecisiveWins = 0;
  let allDecisiveWins = overallAcc.wins;

  for (const t of trades) {
    const status = t.tradeEvaluationStatus;
    if (status === "INSUFFICIENT_CONTEXT") {
      insufficientContext += 1;
      continue;
    }
    if (status === "PASSED") {
      accumulate(passedAcc, t.policyClassification);
      continue;
    }
    if (status !== "FAILED") {
      continue;
    }

    const reason = resolveEvaluatorFailureReasonBucket(t)!;
    if (reason === EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED) {
      failedMissing += 1;
    }

    const acc = byReason.get(reason) ?? emptyAcc();
    accumulate(acc, t.policyClassification);
    byReason.set(reason, acc);

    const oc = outcomeByReason.get(reason) ?? emptyAcc();
    accumulate(oc, t.policyClassification);
    outcomeByReason.set(reason, oc);

    if (t.policyClassification === "FAVORABLE_RESOLUTION") {
      totalFailedWins += 1;
      totalFailedDecisiveWins += 1;
    }

    const dir = resolveIndependentTradeDirectionSliceKey(t);
    bumpDim(dimDirection, dir, reason, t.policyClassification);
    bumpDim(
      dimRr,
      classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio),
      reason,
      t.policyClassification
    );
    bumpDim(dimFamily, t.setupFamilyId || "UNKNOWN", reason, t.policyClassification);
    bumpDim(dimGeometry, geometryForTrade(t), reason, t.policyClassification);
    bumpDim(dimExit, t.pathOutcome, reason, t.policyClassification);
    const dur = resolveDurationBucket(t.lifecycleDurationBars);
    if (dur) {
      bumpDim(dimDuration, dur, reason, t.policyClassification);
    }
  }

  const overallByFailureReason = [...byReason.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([reason, acc]) => accToOverall(reason, acc));

  const failedTradeOutcomeAnalysis: EvaluatorFailureReasonFailedSlice[] =
    overallByFailureReason.map((row) => ({
      failureReason: row.failureReason,
      failedTrades: row.totalTrades,
      failedDecisive: row.decisiveTrades,
      failedWins: row.wins,
      failedLosses: row.losses,
      failedWinRateDecisive: row.decisiveWinRate,
      failedWinsContributionToAllFailedWins:
        totalFailedWins === 0 ? null : row.wins / totalFailedWins,
      failedWinsContributionToAllDecisiveWins:
        allDecisiveWins === 0 ? null : row.wins / allDecisiveWins,
      sampleSizeQuality: row.sampleSizeQuality,
    }));

  const failureReasonByOutcome = [...outcomeByReason.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([failureReason, o]) => ({
      failureReason,
      byOutcome: {
        wins: o.wins,
        losses: o.losses,
        inconclusive: o.inconclusive,
        unresolved: o.unresolved,
        unmeasured: o.unmeasured,
        decisive: o.decisive,
      },
    }));

  const flattenDim = <T extends string>(
    store: Map<string, Map<EvaluatorFailureReasonAnalysisBucket, Acc>>
  ) => {
    const rows: {
      failureReason: EvaluatorFailureReasonAnalysisBucket;
      dimensionKey: T;
      total: number;
      decisive: number;
      wins: number;
      losses: number;
      winRate_decisive: ReturnType<typeof computeIndependentTradeWinRateDecisive>;
    }[] = [];
    for (const [dimKey, byR] of store) {
      for (const [reason, acc] of byR) {
        rows.push({
          failureReason: reason,
          dimensionKey: dimKey as T,
          total: acc.total,
          decisive: acc.decisive,
          wins: acc.wins,
          losses: acc.losses,
          winRate_decisive: computeIndependentTradeWinRateDecisive(
            acc.wins,
            acc.losses
          ),
        });
      }
    }
    return rows.sort(
      (a, b) =>
        String(a.failureReason).localeCompare(String(b.failureReason)) ||
        String(a.dimensionKey).localeCompare(String(b.dimensionKey))
    );
  };

  const statsWins = statisticsReport?.overall.counts.wins ?? null;
  const statsLosses = statisticsReport?.overall.counts.losses ?? null;
  const statsDecisive =
    statisticsReport?.overall.counts.decisiveResolutions ?? null;

  const parityHolds =
    statsWins === null
      ? true
      : statsWins === overallAcc.wins &&
        statsLosses === overallAcc.losses &&
        statsDecisive === overallAcc.decisive;

  const failedReasonTradeSum = overallByFailureReason.reduce(
    (s, r) => s + r.totalTrades,
    0
  );

  return {
    schemaVersion: HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_EVALUATOR_FAILURE_REASON",
    canonicalSource: {
      artifactPath: EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
      lifecycleField: EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
      freezeNote: EVALUATOR_FAILURE_REASON_CONTRACT_NOTES.frozenAtEvaluationBarE,
    },
    population: {
      independentTrades: trades.length,
      snapshotReference: statisticsReport?.snapshotReference ?? null,
      reconciliationNote:
        `FAILED trades with reason buckets: ${failedReasonTradeSum}; PASSED: ${passedAcc.total}; INSUFFICIENT_CONTEXT: ${insufficientContext}; missing firstFailure on FAILED: ${failedMissing}. Sum reconciles with lifecycle trade population (FAILED-only buckets exclude PASSED/INSUFFICIENT_CONTEXT).`,
    },
    parity: {
      lifecycleWins: overallAcc.wins,
      lifecycleLosses: overallAcc.losses,
      lifecycleDecisive: overallAcc.decisive,
      statisticsWins: statsWins,
      statisticsLosses: statsLosses,
      statisticsDecisive: statsDecisive,
      parityHolds,
    },
    overallByFailureReason,
    failedTradeOutcomeAnalysis,
    passedTradeOutcomeAnalysis: {
      passedTrades: passedAcc.total,
      passedDecisive: passedAcc.decisive,
      passedWins: passedAcc.wins,
      passedLosses: passedAcc.losses,
      passedWinRateDecisive: computeIndependentTradeWinRateDecisive(
        passedAcc.wins,
        passedAcc.losses
      ),
      denominatorId: EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS.PASSED_DECISIVE_RESOLUTIONS,
    },
    failureReasonByOutcome,
    byDirection: flattenDim(dimDirection),
    byRrBucket: flattenDim(dimRr),
    bySetupFamily: flattenDim(dimFamily),
    byGeometry: flattenDim(dimGeometry),
    byExitReason: flattenDim(dimExit),
    byDuration: flattenDim(dimDuration),
    unknownPopulation: {
      failedWithMissingFailureReason: failedMissing,
      insufficientContextNoFailureReason: insufficientContext,
      notes: `${EVALUATOR_FAILURE_REASON_INSUFFICIENT_CONTEXT_BUCKET} counts INSUFFICIENT_CONTEXT trades; missing bucket uses ${EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED}.`,
    },
    warnings: WARNINGS,
  };
}
