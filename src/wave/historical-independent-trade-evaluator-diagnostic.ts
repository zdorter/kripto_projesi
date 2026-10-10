import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { HISTORICAL_POSITION_POLICY_CLASSIFICATIONS } from "./historical-position-outcome-policy-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import { INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import { compareIndependentTradeGroups } from "./historical-independent-trade-statistical-validation";
import type { IndependentTradeStatisticalValidationReport } from "./historical-independent-trade-statistical-validation-types";
import {
  EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES,
  HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION,
  type AnalyzeIndependentTradeEvaluatorDiagnosticInput,
  type EvaluatorDiagnosticDimensionSlice,
  type EvaluatorDiagnosticDriverNote,
  type EvaluatorDiagnosticDurationSummary,
  type EvaluatorDiagnosticEvaluationOutcomeCross,
  type EvaluatorDiagnosticEvaluationStatus,
  type EvaluatorDiagnosticExitDistributionRow,
  type EvaluatorDiagnosticGroupSummary,
  type EvaluatorDiagnosticMismatchSummary,
  type EvaluatorDiagnosticOutcomeCounts,
  type HistoricalIndependentTradeEvaluatorDiagnosticReport,
} from "./historical-independent-trade-evaluator-diagnostic-types";

function resolveEvalStatus(
  trade: IndependentTradeUnit
): EvaluatorDiagnosticEvaluationStatus | null {
  const s = trade.tradeEvaluationStatus;
  if (s === "PASSED" || s === "FAILED" || s === "INSUFFICIENT_CONTEXT") {
    return s;
  }
  return null;
}

function resolveDurationBucket(
  durationBars: number | null
): (typeof INDEPENDENT_TRADE_DURATION_BUCKET_IDS)[number] | null {
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

function emptyOutcomeCounts(): EvaluatorDiagnosticOutcomeCounts {
  return {
    totalTrades: 0,
    decisiveTrades: 0,
    favorableWins: 0,
    adverseLosses: 0,
    inconclusiveSameBar: 0,
    unresolvedAtHorizon: 0,
    unmeasuredNoFuture: 0,
    unmeasuredInsufficient: 0,
  };
}

function accumulateClassification(
  counts: EvaluatorDiagnosticOutcomeCounts,
  classification: HistoricalPositionPolicyClassification
): void {
  counts.totalTrades += 1;
  switch (classification) {
    case "FAVORABLE_RESOLUTION":
      counts.favorableWins += 1;
      counts.decisiveTrades += 1;
      break;
    case "ADVERSE_RESOLUTION":
      counts.adverseLosses += 1;
      counts.decisiveTrades += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      counts.inconclusiveSameBar += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      counts.unresolvedAtHorizon += 1;
      break;
    case "UNMEASURED_NO_FUTURE":
      counts.unmeasuredNoFuture += 1;
      break;
    case "UNMEASURED_INSUFFICIENT":
      counts.unmeasuredInsufficient += 1;
      break;
    default:
      break;
  }
}

function countsFromCrossRow(
  row: Record<HistoricalPositionPolicyClassification, number>
): EvaluatorDiagnosticOutcomeCounts {
  const counts = emptyOutcomeCounts();
  for (const c of HISTORICAL_POSITION_POLICY_CLASSIFICATIONS) {
    const n = row[c];
    for (let i = 0; i < n; i++) {
      accumulateClassification(counts, c);
    }
  }
  return counts;
}

function decisiveWinRateFromCounts(
  counts: EvaluatorDiagnosticOutcomeCounts
): number | null {
  const rate = computeIndependentTradeWinRateDecisive(
    counts.favorableWins,
    counts.adverseLosses
  );
  return rate.value;
}

function buildGroupSummary(
  status: EvaluatorDiagnosticEvaluationStatus,
  counts: EvaluatorDiagnosticOutcomeCounts,
  overallRate: number | null,
  overallDecisive: number,
  overallWins: number
): EvaluatorDiagnosticGroupSummary {
  const decisive = counts.decisiveTrades;
  const rate = decisiveWinRateFromCounts(counts);
  const quality = classifyHistoricalIndependentTradeSampleSize(decisive);
  return {
    evaluationStatus: status,
    counts,
    decisiveWinRate: rate,
    sampleSizeQuality: quality,
    interpretWithCaution:
      quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
    winRateDeltaFromOverall:
      rate === null || overallRate === null ? null : rate - overallRate,
    decisiveShareOfOverall:
      overallDecisive === 0 ? null : decisive / overallDecisive,
    contributionToDecisiveWins:
      overallWins === 0 ? null : counts.favorableWins / overallWins,
  };
}

function buildCrossFromStats(
  report: IndependentTradeStatisticsReport
): EvaluatorDiagnosticEvaluationOutcomeCross {
  const cross = {} as EvaluatorDiagnosticEvaluationOutcomeCross;
  for (const status of EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES) {
    cross[status] = { ...report.evaluationCross[status] };
  }
  return cross;
}

function aggregateTradesForEval(
  trades: readonly IndependentTradeUnit[],
  status: EvaluatorDiagnosticEvaluationStatus
): EvaluatorDiagnosticOutcomeCounts {
  const counts = emptyOutcomeCounts();
  for (const t of trades) {
    if (resolveEvalStatus(t) !== status) {
      continue;
    }
    accumulateClassification(counts, t.policyClassification);
  }
  return counts;
}

function buildDimensionSlices(
  trades: readonly IndependentTradeUnit[],
  dimension: "direction" | "rr" | "family" | "duration",
  overallRate: number | null
): EvaluatorDiagnosticDimensionSlice[] {
  const buckets = new Map<
    string,
    Map<EvaluatorDiagnosticEvaluationStatus, EvaluatorDiagnosticOutcomeCounts>
  >();

  for (const t of trades) {
    const evalStatus = resolveEvalStatus(t);
    if (!evalStatus) {
      continue;
    }
    let key: string;
    switch (dimension) {
      case "direction":
        key = resolveIndependentTradeDirectionSliceKey(t);
        break;
      case "rr":
        key = classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio);
        break;
      case "family":
        key = t.setupFamilyId;
        break;
      case "duration": {
        const bucket = resolveDurationBucket(t.lifecycleDurationBars);
        if (!bucket) {
          continue;
        }
        key = bucket;
        break;
      }
      default:
        continue;
    }
    const byEval = buckets.get(key) ?? new Map();
    const counts = byEval.get(evalStatus) ?? emptyOutcomeCounts();
    accumulateClassification(counts, t.policyClassification);
    byEval.set(evalStatus, counts);
    buckets.set(key, byEval);
  }

  const slices: EvaluatorDiagnosticDimensionSlice[] = [];
  for (const [dimensionKey, byEval] of buckets) {
    for (const status of EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES) {
      const counts = byEval.get(status);
      if (!counts || counts.totalTrades === 0) {
        continue;
      }
      const rate = decisiveWinRateFromCounts(counts);
      const quality = classifyHistoricalIndependentTradeSampleSize(
        counts.decisiveTrades
      );
      slices.push({
        evaluationStatus: status,
        dimensionKey,
        totalTrades: counts.totalTrades,
        decisiveTrades: counts.decisiveTrades,
        favorableWins: counts.favorableWins,
        adverseLosses: counts.adverseLosses,
        decisiveWinRate: rate,
        sampleSizeQuality: quality,
        interpretWithCaution:
          quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
        winRateDeltaFromOverall:
          rate === null || overallRate === null ? null : rate - overallRate,
      });
    }
  }

  return slices.sort(
    (a, b) =>
      a.evaluationStatus.localeCompare(b.evaluationStatus) ||
      a.dimensionKey.localeCompare(b.dimensionKey)
  );
}

function buildExitRows(
  trades: readonly IndependentTradeUnit[]
): EvaluatorDiagnosticExitDistributionRow[] {
  const totals = new Map<
    EvaluatorDiagnosticEvaluationStatus,
    Map<ProspectiveSetupOutcomeReplayStatus, number>
  >();
  for (const status of EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES) {
    totals.set(status, new Map());
  }
  for (const t of trades) {
    const evalStatus = resolveEvalStatus(t);
    if (!evalStatus) {
      continue;
    }
    const map = totals.get(evalStatus)!;
    map.set(t.pathOutcome, (map.get(t.pathOutcome) ?? 0) + 1);
  }
  const rows: EvaluatorDiagnosticExitDistributionRow[] = [];
  for (const status of EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES) {
    const map = totals.get(status)!;
    const groupTotal = [...map.values()].reduce((a, b) => a + b, 0);
    for (const [outcome, count] of map) {
      rows.push({
        evaluationStatus: status,
        pathOutcome: outcome,
        count,
        shareWithinEvaluationGroup:
          groupTotal === 0 ? 0 : count / groupTotal,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.evaluationStatus.localeCompare(b.evaluationStatus) ||
      a.pathOutcome.localeCompare(b.pathOutcome)
  );
}

function buildDurationSummary(
  trades: readonly IndependentTradeUnit[]
): EvaluatorDiagnosticDurationSummary[] {
  const result: EvaluatorDiagnosticDurationSummary[] = [];
  for (const status of EVALUATOR_DIAGNOSTIC_EVALUATION_STATUSES) {
    const durations = trades
      .filter((t) => resolveEvalStatus(t) === status)
      .map((t) => t.lifecycleDurationBars)
      .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
    if (!durations.length) {
      result.push({
        evaluationStatus: status,
        sampleCount: 0,
        averageDurationBars: null,
        medianDurationBars: null,
      });
      continue;
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2;
    result.push({
      evaluationStatus: status,
      sampleCount: sorted.length,
      averageDurationBars: sum / sorted.length,
      medianDurationBars: median,
    });
  }
  return result;
}

function shareOf(
  trades: readonly IndependentTradeUnit[],
  status: EvaluatorDiagnosticEvaluationStatus,
  predicate: (t: IndependentTradeUnit) => boolean
): number | null {
  const group = trades.filter((t) => resolveEvalStatus(t) === status);
  if (!group.length) {
    return null;
  }
  const hit = group.filter(predicate).length;
  return hit / group.length;
}

function buildDrivers(
  trades: readonly IndependentTradeUnit[],
  passed: EvaluatorDiagnosticGroupSummary,
  failed: EvaluatorDiagnosticGroupSummary
): EvaluatorDiagnosticDriverNote[] {
  const caution =
    "This dimension may be among explanatory factors for the observed rate gap; causality has not been tested.";
  const notes: EvaluatorDiagnosticDriverNote[] = [];

  if (passed.decisiveWinRate !== null && failed.decisiveWinRate !== null) {
    notes.push({
      dimension: "evaluation_summary",
      observation: `Observed decisive win rate is ${(
        passed.decisiveWinRate * 100
      ).toFixed(2)}% for PASSED versus ${(failed.decisiveWinRate * 100).toFixed(
        2
      )}% for FAILED (descriptive; not a strategy verdict).`,
      caution,
    });
  }

  for (const dir of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    const pShare = shareOf(trades, "PASSED", (t) =>
      resolveIndependentTradeDirectionSliceKey(t) === dir
    );
    const fShare = shareOf(trades, "FAILED", (t) =>
      resolveIndependentTradeDirectionSliceKey(t) === dir
    );
    if (
      pShare !== null &&
      fShare !== null &&
      Math.abs(pShare - fShare) >= 0.05
    ) {
      notes.push({
        dimension: "direction",
        observation: `Share of ${dir} trades differs between PASSED (${(pShare * 100).toFixed(1)}%) and FAILED (${(fShare * 100).toFixed(1)}%).`,
        caution,
      });
    }
  }

  for (const bucket of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    const pShare = shareOf(
      trades,
      "PASSED",
      (t) => classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio) === bucket
    );
    const fShare = shareOf(
      trades,
      "FAILED",
      (t) => classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio) === bucket
    );
    if (
      pShare !== null &&
      fShare !== null &&
      Math.abs(pShare - fShare) >= 0.05
    ) {
      notes.push({
        dimension: "rr_bucket",
        observation: `RR bucket ${bucket} share differs between PASSED (${(pShare * 100).toFixed(1)}%) and FAILED (${(fShare * 100).toFixed(1)}%).`,
        caution,
      });
    }
  }

  if (
    (passed.contributionToDecisiveWins ?? 0) <
    (failed.contributionToDecisiveWins ?? 0)
  ) {
    notes.push({
      dimension: "contribution",
      observation:
        "FAILED trades contribute a larger share of overall decisive wins than PASSED trades in this population.",
      caution,
    });
  }

  return notes;
}

function buildMismatch(
  cross: EvaluatorDiagnosticEvaluationOutcomeCross
): EvaluatorDiagnosticMismatchSummary {
  const passedWins = cross.PASSED.FAVORABLE_RESOLUTION;
  const passedLosses = cross.PASSED.ADVERSE_RESOLUTION;
  const failedWins = cross.FAILED.FAVORABLE_RESOLUTION;
  const failedLosses = cross.FAILED.ADVERSE_RESOLUTION;
  const passedDecisive = passedWins + passedLosses;
  const failedDecisive = failedWins + failedLosses;
  const passedWinRate =
    passedDecisive === 0 ? null : passedWins / passedDecisive;
  const failedWinRate =
    failedDecisive === 0 ? null : failedWins / failedDecisive;
  const diffPp =
    passedWinRate === null || failedWinRate === null
      ? null
      : (passedWinRate - failedWinRate) * 100;
  return {
    passedWins,
    passedLosses,
    failedWins,
    failedLosses,
    passedDecisive,
    failedDecisive,
    passedWinRate,
    failedWinRate,
    decisiveWinRateDifferencePercentagePoints: diffPp,
    passedWinsObservedMismatch: passedWins,
    passedLossesObservedMismatch: passedLosses,
    failedWinsObservedMismatch: failedWins,
    failedLossesObservedMismatch: failedLosses,
  };
}

/**
 * B-12f: diagnostic analysis of PASSED vs FAILED evaluation on existing independent trades.
 */
export function analyzeIndependentTradeEvaluatorDiagnostic(
  input: AnalyzeIndependentTradeEvaluatorDiagnosticInput
): HistoricalIndependentTradeEvaluatorDiagnosticReport {
  const { statisticsReport, lifecycleReport, validationReport } = input;
  const trades = lifecycleReport?.trades ?? [];
  const overallCounts: EvaluatorDiagnosticOutcomeCounts = {
    totalTrades: statisticsReport.overall.counts.totalTrades,
    decisiveTrades: statisticsReport.overall.counts.decisiveResolutions,
    favorableWins: statisticsReport.overall.counts.wins,
    adverseLosses: statisticsReport.overall.counts.losses,
    inconclusiveSameBar: statisticsReport.overall.counts.inconclusiveSameBar,
    unresolvedAtHorizon: statisticsReport.overall.counts.unresolvedAtHorizon,
    unmeasuredNoFuture: statisticsReport.overall.counts.unmeasuredNoFuture,
    unmeasuredInsufficient:
      statisticsReport.overall.counts.unmeasuredInsufficient,
  };
  const overallRate = statisticsReport.overall.rates.winRate_decisive.value;
  const overallDecisive = overallCounts.decisiveTrades;
  const overallWins = overallCounts.favorableWins;

  const evaluationOutcomeCross = buildCrossFromStats(statisticsReport);

  const passedCounts =
    trades.length > 0
      ? aggregateTradesForEval(trades, "PASSED")
      : countsFromCrossRow(evaluationOutcomeCross.PASSED);
  const failedCounts =
    trades.length > 0
      ? aggregateTradesForEval(trades, "FAILED")
      : countsFromCrossRow(evaluationOutcomeCross.FAILED);
  const insufficientCounts =
    trades.length > 0
      ? aggregateTradesForEval(trades, "INSUFFICIENT_CONTEXT")
      : countsFromCrossRow(evaluationOutcomeCross.INSUFFICIENT_CONTEXT);

  const passed = buildGroupSummary(
    "PASSED",
    passedCounts,
    overallRate,
    overallDecisive,
    overallWins
  );
  const failed = buildGroupSummary(
    "FAILED",
    failedCounts,
    overallRate,
    overallDecisive,
    overallWins
  );
  const insufficientContext = buildGroupSummary(
    "INSUFFICIENT_CONTEXT",
    insufficientCounts,
    overallRate,
    overallDecisive,
    overallWins
  );

  const passedVsFailedComparison =
    validationReport?.evaluationComparison.passedVsFailed ??
    compareIndependentTradeGroups(
      { wins: passedCounts.favorableWins, losses: passedCounts.adverseLosses },
      { wins: failedCounts.favorableWins, losses: failedCounts.adverseLosses }
    );

  const mismatch = buildMismatch(evaluationOutcomeCross);

  const byDirection = trades.length
    ? buildDimensionSlices(trades, "direction", overallRate)
    : [];
  const byRrBucket = trades.length
    ? buildDimensionSlices(trades, "rr", overallRate)
    : [];
  const bySetupFamily = trades.length
    ? buildDimensionSlices(trades, "family", overallRate)
    : [];
  const byDuration = trades.length
    ? buildDimensionSlices(trades, "duration", overallRate)
    : [];
  const byExitReason = trades.length ? buildExitRows(trades) : [];
  const durationSummary = trades.length ? buildDurationSummary(trades) : [];

  const drivers = trades.length
    ? buildDrivers(trades, passed, failed)
    : [
        {
          dimension: "data_availability",
          observation:
            "Lifecycle trades not provided; dimension drivers require B-12b lifecycleReport.",
          caution:
            "Pass lifecycleReport for direction/RR/family/duration diagnostic slices.",
        },
      ];

  return {
    schemaVersion:
      HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION,
    researchQuestion:
      "Why does TRADE_EVAL_PASSED show a lower historically observed decisive win rate than FAILED in this independent trade population?",
    population: {
      independentTrades: statisticsReport.overall.counts.totalTrades,
      decisiveResolutions: overallDecisive,
      snapshotReference: statisticsReport.snapshotReference,
    },
    overall: {
      decisiveWinRate: overallRate,
      counts: overallCounts,
    },
    evaluation: {
      passed,
      failed,
      insufficientContext,
      evaluationOutcomeCross,
      passedVsFailedComparison,
    },
    byDirection,
    byRrBucket,
    bySetupFamily,
    byExitReason,
    byDuration,
    durationSummary,
    mismatch,
    drivers,
    warnings: {
      temporalDependence:
        "Independent trade (lifecycle mutex) does not guarantee statistical independence across time.",
      overlappingHistoricalObservations:
        "Upstream snapshot cohorts may overlap; this diagnostic uses independent trade population only.",
      sampleSize:
        "Subgroup slices use B-12d sample-size bands; interpret small decisive samples with caution.",
      multipleComparisons:
        "Many descriptive slices are inspected; no multiplicity correction is applied.",
      observationalAnalysis:
        "This is observational diagnostic analysis on historical outcomes only.",
      noPnL: "PnL is not computed in B-12f.",
      noFees: "Fees are not modeled.",
      noSlippage: "Slippage is not modeled.",
      noExecutionSimulation: "Execution/fill simulation is not performed.",
      notCausalInference:
        "Driver notes describe associations, not proven causes.",
      notEvaluatorVerdict:
        "Disagreement between trade evaluation status and path outcome is an observed mismatch, not an automatic evaluator fault verdict.",
    },
  };
}
