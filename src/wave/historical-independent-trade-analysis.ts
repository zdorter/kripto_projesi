import { HISTORICAL_MEASUREMENT_COHORTS } from "./setup/historical-measurement-contract";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticsSlice } from "./historical-independent-trade-statistics-types";
import { INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_INDEPENDENT_TRADE_ANALYSIS_SCHEMA_VERSION,
  INDEPENDENT_TRADE_DURATION_BUCKET_IDS,
  INDEPENDENT_TRADE_SAMPLE_SIZE_CONTRACT_VERSION,
  INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS,
  type AnalyzeIndependentTradeStatisticsInput,
  type IndependentTradeAnalysisConfiguration,
  type IndependentTradeAnalysisMetrics,
  type IndependentTradeAnalysisReport,
  type IndependentTradeCombinedAnalysis,
  type IndependentTradeDurationBucketId,
  type IndependentTradeEvaluationOutcomeCrossCell,
  type IndependentTradeExitReasonAnalysisRow,
  type IndependentTradeHighestObservedWinRate,
  type IndependentTradeSampleSizeQuality,
} from "./historical-independent-trade-analysis-types";

const PATH_OUTCOMES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

export function classifyHistoricalIndependentTradeSampleSize(
  decisiveResolutions: number
): IndependentTradeSampleSizeQuality {
  const d = decisiveResolutions;
  if (d < INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS.verySmallMaxExclusive) {
    return "VERY_SMALL_SAMPLE";
  }
  if (d < INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS.smallMaxExclusive) {
    return "SMALL_SAMPLE";
  }
  if (d < INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS.moderateMaxExclusive) {
    return "MODERATE_SAMPLE";
  }
  return "LARGE_SAMPLE";
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

function sliceToCounts(slice: IndependentTradeStatisticsSlice) {
  return slice.counts;
}

function buildMetrics(
  slice: IndependentTradeStatisticsSlice,
  overall: IndependentTradeStatisticsSlice
): IndependentTradeAnalysisMetrics {
  const c = slice.counts;
  const winRate = slice.rates.winRate_decisive;
  const overallRate = overall.rates.winRate_decisive.value;
  const winRateDelta =
    winRate.value === null || overallRate === null
      ? null
      : winRate.value - overallRate;
  const overallDecisive = overall.counts.decisiveResolutions;
  const overallWins = overall.counts.wins;
  return {
    totalTrades: c.totalTrades,
    wins: c.wins,
    losses: c.losses,
    decisiveResolutions: c.decisiveResolutions,
    winRate_decisive: winRate,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(
      c.decisiveResolutions
    ),
    isActionable:
      c.decisiveResolutions >=
      INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS.actionableDecisiveMin,
    winRateDeltaFromOverall: winRateDelta,
    decisiveShareOfOverall:
      overallDecisive === 0 ? null : c.decisiveResolutions / overallDecisive,
    contributionToDecisiveWins:
      overallWins === 0 ? null : c.wins / overallWins,
  };
}

function metricsFromTradeList(
  trades: readonly IndependentTradeUnit[],
  overall: IndependentTradeStatisticsSlice
): IndependentTradeAnalysisMetrics {
  let wins = 0;
  let losses = 0;
  let inconclusive = 0;
  let unresolved = 0;
  let unmeasuredNoFuture = 0;
  let unmeasuredInsufficient = 0;
  for (const t of trades) {
    switch (t.policyClassification) {
      case "FAVORABLE_RESOLUTION":
        wins += 1;
        break;
      case "ADVERSE_RESOLUTION":
        losses += 1;
        break;
      case "INCONCLUSIVE_SAME_BAR":
        inconclusive += 1;
        break;
      case "UNRESOLVED_AT_HORIZON":
        unresolved += 1;
        break;
      case "UNMEASURED_NO_FUTURE":
        unmeasuredNoFuture += 1;
        break;
      case "UNMEASURED_INSUFFICIENT":
        unmeasuredInsufficient += 1;
        break;
      default:
        break;
    }
  }
  const slice: IndependentTradeStatisticsSlice = {
    counts: {
      totalTrades: trades.length,
      measuredTrades:
        wins + losses + inconclusive + unresolved,
      unmeasuredTrades: unmeasuredNoFuture + unmeasuredInsufficient,
      favorableResolutions: wins,
      adverseResolutions: losses,
      wins,
      losses,
      decisiveResolutions: wins + losses,
      inconclusiveSameBar: inconclusive,
      unresolvedAtHorizon: unresolved,
      unmeasuredNoFuture,
      unmeasuredInsufficient,
      measuredNonDecisive: inconclusive + unresolved,
      totalTradeObservations: trades.length,
    },
    denominators: {
      filteredTrades: trades.length,
      measuredTrades:
        wins + losses + inconclusive + unresolved,
      unmeasuredTrades: unmeasuredNoFuture + unmeasuredInsufficient,
      decisiveResolutions: wins + losses,
      measuredNonDecisive: inconclusive + unresolved,
    },
    classification: overall.classification,
    rates: {
      winRate_decisive: computeIndependentTradeWinRateDecisive(wins, losses),
    },
  };
  return buildMetrics(slice, overall);
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key]!;
  }
  return out;
}

function buildEvaluationAnalysis(
  report: IndependentTradeStatisticsReport,
  overall: IndependentTradeStatisticsSlice
): Record<TradeEvaluationStatus, IndependentTradeAnalysisMetrics> {
  const result = {} as Record<TradeEvaluationStatus, IndependentTradeAnalysisMetrics>;
  for (const status of INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS) {
    const row = report.evaluationCross[status];
    const wins = row.FAVORABLE_RESOLUTION;
    const losses = row.ADVERSE_RESOLUTION;
    const totalTrades =
      wins +
      losses +
      row.INCONCLUSIVE_SAME_BAR +
      row.UNRESOLVED_AT_HORIZON +
      row.UNMEASURED_NO_FUTURE +
      row.UNMEASURED_INSUFFICIENT;
    const slice: IndependentTradeStatisticsSlice = {
      counts: {
        totalTrades,
        measuredTrades:
          wins +
          losses +
          row.INCONCLUSIVE_SAME_BAR +
          row.UNRESOLVED_AT_HORIZON,
        unmeasuredTrades:
          row.UNMEASURED_NO_FUTURE + row.UNMEASURED_INSUFFICIENT,
        favorableResolutions: wins,
        adverseResolutions: losses,
        wins,
        losses,
        decisiveResolutions: wins + losses,
        inconclusiveSameBar: row.INCONCLUSIVE_SAME_BAR,
        unresolvedAtHorizon: row.UNRESOLVED_AT_HORIZON,
        unmeasuredNoFuture: row.UNMEASURED_NO_FUTURE,
        unmeasuredInsufficient: row.UNMEASURED_INSUFFICIENT,
        measuredNonDecisive:
          row.INCONCLUSIVE_SAME_BAR + row.UNRESOLVED_AT_HORIZON,
        totalTradeObservations: totalTrades,
      },
      denominators: {
        filteredTrades: totalTrades,
        measuredTrades:
          wins +
          losses +
          row.INCONCLUSIVE_SAME_BAR +
          row.UNRESOLVED_AT_HORIZON,
        unmeasuredTrades:
          row.UNMEASURED_NO_FUTURE + row.UNMEASURED_INSUFFICIENT,
        decisiveResolutions: wins + losses,
        measuredNonDecisive:
          row.INCONCLUSIVE_SAME_BAR + row.UNRESOLVED_AT_HORIZON,
      },
      classification: row,
      rates: {
        winRate_decisive: computeIndependentTradeWinRateDecisive(wins, losses),
      },
    };
    result[status] = buildMetrics(slice, overall);
  }
  return result;
}

function buildExitReasonAnalysis(
  report: IndependentTradeStatisticsReport
): IndependentTradeExitReasonAnalysisRow[] {
  const total = report.overall.counts.totalTrades;
  const rows: IndependentTradeExitReasonAnalysisRow[] = [];
  for (const outcome of PATH_OUTCOMES) {
    const count = report.pathOutcomeDistribution[outcome];
    rows.push({
      pathOutcome: outcome,
      count,
      percentageOfTrades: total === 0 ? 0 : count / total,
    });
  }
  return rows;
}

function buildEvaluationOutcomeCross(
  report: IndependentTradeStatisticsReport
): IndependentTradeEvaluationOutcomeCrossCell[] {
  const cells: IndependentTradeEvaluationOutcomeCrossCell[] = [];
  for (const status of INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS) {
    const row = report.evaluationCross[status];
    for (const classification of Object.keys(row) as Array<
      keyof typeof row
    >) {
      const count = row[classification];
      if (count > 0) {
        cells.push({
          evaluationStatus: status,
          policyClassification: classification,
          count,
        });
      }
    }
  }
  return cells.sort(
    (a, b) =>
      a.evaluationStatus.localeCompare(b.evaluationStatus) ||
      a.policyClassification.localeCompare(b.policyClassification)
  );
}

function emptyDurationBuckets(
  overall: IndependentTradeStatisticsSlice
): Record<
  IndependentTradeDurationBucketId,
  IndependentTradeAnalysisMetrics
> {
  const empty: Record<string, IndependentTradeAnalysisMetrics> = {};
  for (const id of INDEPENDENT_TRADE_DURATION_BUCKET_IDS) {
    empty[id] = metricsFromTradeList([], overall);
  }
  return empty as Record<
    IndependentTradeDurationBucketId,
    IndependentTradeAnalysisMetrics
  >;
}

function buildCombinedFromTrades(
  trades: readonly IndependentTradeUnit[],
  overall: IndependentTradeStatisticsSlice
): IndependentTradeCombinedAnalysis {
  const directionByRrBucket: Record<string, IndependentTradeAnalysisMetrics> =
    {};
  const directionBySetupFamily: Record<
    string,
    IndependentTradeAnalysisMetrics
  > = {};
  const rrBucketBySetupFamily: Record<string, IndependentTradeAnalysisMetrics> =
    {};
  const evaluationByDirection: Record<string, IndependentTradeAnalysisMetrics> =
    {};

  const dirRr = new Map<string, IndependentTradeUnit[]>();
  const dirFam = new Map<string, IndependentTradeUnit[]>();
  const rrFam = new Map<string, IndependentTradeUnit[]>();
  const evalDir = new Map<string, IndependentTradeUnit[]>();

  for (const t of trades) {
    const dir = resolveIndependentTradeDirectionSliceKey(t);
    const rr = classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio);
    const fam = t.setupFamilyId;
    const evalStatus = t.tradeEvaluationStatus;

    const k1 = `${dir}|${rr}`;
    const l1 = dirRr.get(k1) ?? [];
    l1.push(t);
    dirRr.set(k1, l1);

    const k2 = `${dir}|${fam}`;
    const l2 = dirFam.get(k2) ?? [];
    l2.push(t);
    dirFam.set(k2, l2);

    const k3 = `${rr}|${fam}`;
    const l3 = rrFam.get(k3) ?? [];
    l3.push(t);
    rrFam.set(k3, l3);

    const k4 = `${evalStatus}|${dir}`;
    const l4 = evalDir.get(k4) ?? [];
    l4.push(t);
    evalDir.set(k4, l4);
  }

  for (const [key, list] of dirRr) {
    directionByRrBucket[key] = metricsFromTradeList(list, overall);
  }
  for (const [key, list] of dirFam) {
    directionBySetupFamily[key] = metricsFromTradeList(list, overall);
  }
  for (const [key, list] of rrFam) {
    rrBucketBySetupFamily[key] = metricsFromTradeList(list, overall);
  }
  for (const [key, list] of evalDir) {
    evaluationByDirection[key] = metricsFromTradeList(list, overall);
  }

  return {
    directionByRrBucket: sortRecord(directionByRrBucket),
    directionBySetupFamily: sortRecord(directionBySetupFamily),
    rrBucketBySetupFamily: sortRecord(rrBucketBySetupFamily),
    evaluationByDirection: sortRecord(evaluationByDirection),
  };
}

function buildDurationBucketsFromTrades(
  trades: readonly IndependentTradeUnit[],
  overall: IndependentTradeStatisticsSlice
): Record<
  IndependentTradeDurationBucketId,
  IndependentTradeAnalysisMetrics
> {
  const buckets = new Map<IndependentTradeDurationBucketId, IndependentTradeUnit[]>();
  for (const id of INDEPENDENT_TRADE_DURATION_BUCKET_IDS) {
    buckets.set(id, []);
  }
  for (const t of trades) {
    const bucket = resolveDurationBucket(t.lifecycleDurationBars);
    if (bucket) {
      buckets.get(bucket)!.push(t);
    }
  }
  const result = {} as Record<
    IndependentTradeDurationBucketId,
    IndependentTradeAnalysisMetrics
  >;
  for (const id of INDEPENDENT_TRADE_DURATION_BUCKET_IDS) {
    result[id] = metricsFromTradeList(buckets.get(id)!, overall);
  }
  return result;
}

function collectHighestObserved(
  dimension: string,
  entries: Record<string, IndependentTradeAnalysisMetrics>
): IndependentTradeHighestObservedWinRate[] {
  const list: IndependentTradeHighestObservedWinRate[] = [];
  for (const [key, m] of Object.entries(entries)) {
    if (m.decisiveResolutions === 0) {
      continue;
    }
    list.push({
      dimension,
      key,
      winRate_decisive: m.winRate_decisive.value,
      decisiveResolutions: m.decisiveResolutions,
      sampleSizeQuality: m.sampleSizeQuality,
      note:
        m.sampleSizeQuality === "VERY_SMALL_SAMPLE" ||
        m.sampleSizeQuality === "SMALL_SAMPLE"
          ? "Highest observed rate may be unreliable due to small decisive sample."
          : "Historically observed decisive win rate for this slice.",
    });
  }
  list.sort((a, b) => (b.winRate_decisive ?? -1) - (a.winRate_decisive ?? -1));
  return list;
}

function buildDescriptiveNotes(
  report: IndependentTradeAnalysisReport
): string[] {
  const notes: string[] = [];
  const pop = report.population;
  notes.push(
    `Independent trade population: ${pop.snapshotReference.independentTrades} trades from ${pop.snapshotReference.totalSnapshots} snapshots (snapshot analysis is separate from B-11).`
  );
  if (pop.winRate_decisive.value !== null) {
    notes.push(
      `Overall historically observed decisive win rate: ${(
        pop.winRate_decisive.value * 100
      ).toFixed(2)}% (${pop.wins} wins / ${pop.decisiveResolutions} decisive).`
    );
  }
  const bull = report.byDirection.BULLISH;
  const bear = report.byDirection.BEARISH;
  if (
    bull.winRate_decisive.value !== null &&
    bear.winRate_decisive.value !== null
  ) {
    const delta = bull.winRate_decisive.value - bear.winRate_decisive.value;
    notes.push(
      `BULLISH decisive win rate minus BEARISH: ${(delta * 100).toFixed(2)} percentage points (descriptive; not a significance test).`
    );
  }
  const passed = report.byEvaluation.PASSED;
  const failed = report.byEvaluation.FAILED;
  if (passed.winRate_decisive.value !== null) {
    notes.push(
      `PASSED trade-evaluation slice historically observed decisive win rate: ${(
        passed.winRate_decisive.value * 100
      ).toFixed(2)}% (n=${passed.decisiveResolutions} decisive).`
    );
  }
  if (failed.winRate_decisive.value !== null) {
    notes.push(
      `FAILED trade-evaluation slice historically observed decisive win rate: ${(
        failed.winRate_decisive.value * 100
      ).toFixed(2)}% (n=${failed.decisiveResolutions} decisive).`
    );
  }
  return notes;
}

export function emptyIndependentTradeAnalysisReport(
  statisticsReport: IndependentTradeStatisticsReport
): IndependentTradeAnalysisReport {
  return analyzeIndependentTradeStatistics({ statisticsReport });
}

/**
 * B-12d: descriptive deep-dive on B-12c independent trade statistics (no new trades/paths).
 */
export function analyzeIndependentTradeStatistics(
  input: AnalyzeIndependentTradeStatisticsInput
): IndependentTradeAnalysisReport {
  const { statisticsReport, lifecycleReport } = input;
  const overallSlice = statisticsReport.overall;
  const overall = buildMetrics(overallSlice, overallSlice);

  const configuration: IndependentTradeAnalysisConfiguration = {
    analysisSchemaVersion: HISTORICAL_INDEPENDENT_TRADE_ANALYSIS_SCHEMA_VERSION,
    sampleSizeContractVersion: INDEPENDENT_TRADE_SAMPLE_SIZE_CONTRACT_VERSION,
    statisticsSchemaVersion: statisticsReport.statisticsSchemaVersion,
    policyId: statisticsReport.policyId,
    entryEventPolicyId: statisticsReport.entryEventPolicyId,
    populationKind: "INDEPENDENT_TRADE_ANALYSIS",
  };

  const byDirection = {} as Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    IndependentTradeAnalysisMetrics
  >;
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    byDirection[key] = buildMetrics(statisticsReport.byDirection[key], overallSlice);
  }

  const byRrBucket = {} as IndependentTradeAnalysisReport["byRrBucket"];
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    byRrBucket[row] = buildMetrics(statisticsReport.byRrBucket[row], overallSlice);
  }

  const bySetupFamily: Record<string, IndependentTradeAnalysisMetrics> = {};
  for (const [key, slice] of Object.entries(statisticsReport.bySetupFamily)) {
    bySetupFamily[key] = buildMetrics(slice, overallSlice);
  }

  const bySymbol: Record<string, IndependentTradeAnalysisMetrics> = {};
  for (const [key, slice] of Object.entries(statisticsReport.bySymbol)) {
    bySymbol[key] = buildMetrics(slice, overallSlice);
  }

  const byTimeframe: Record<string, IndependentTradeAnalysisMetrics> = {};
  for (const [key, slice] of Object.entries(statisticsReport.byTimeframe)) {
    byTimeframe[key] = buildMetrics(slice, overallSlice);
  }

  const byCohort = {} as IndependentTradeAnalysisReport["byCohort"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    byCohort[cohort] = buildMetrics(
      statisticsReport.cohorts[cohort],
      overallSlice
    );
  }

  const trades = lifecycleReport?.trades ?? [];
  const combined =
    trades.length > 0
      ? buildCombinedFromTrades(trades, overallSlice)
      : {
          directionByRrBucket: {},
          directionBySetupFamily: {},
          rrBucketBySetupFamily: {},
          evaluationByDirection: {},
        };

  const byDurationBucket =
    trades.length > 0
      ? buildDurationBucketsFromTrades(trades, overallSlice)
      : emptyDurationBuckets(overallSlice);

  const highestObservedWinRates = [
    ...collectHighestObserved("bySetupFamily", bySetupFamily),
    ...collectHighestObserved("byRrBucket", byRrBucket as Record<string, IndependentTradeAnalysisMetrics>),
    ...collectHighestObserved("byDirection", byDirection as Record<string, IndependentTradeAnalysisMetrics>),
  ].sort(
    (a, b) => (b.winRate_decisive ?? -1) - (a.winRate_decisive ?? -1)
  );

  const draft: IndependentTradeAnalysisReport = {
    configuration,
    population: {
      analysisKind: "INDEPENDENT_TRADE",
      snapshotReference: statisticsReport.snapshotReference,
      wins: overallSlice.counts.wins,
      losses: overallSlice.counts.losses,
      inconclusiveSameBar: overallSlice.counts.inconclusiveSameBar,
      unresolvedAtHorizon: overallSlice.counts.unresolvedAtHorizon,
      unmeasuredNoFuture: overallSlice.counts.unmeasuredNoFuture,
      unmeasuredInsufficient: overallSlice.counts.unmeasuredInsufficient,
      decisiveResolutions: overallSlice.counts.decisiveResolutions,
      winRate_decisive: overallSlice.rates.winRate_decisive,
    },
    overall,
    byDirection,
    byRrBucket,
    bySetupFamily: sortRecord(bySetupFamily),
    bySymbol: sortRecord(bySymbol),
    byTimeframe: sortRecord(byTimeframe),
    byCohort,
    byEvaluation: buildEvaluationAnalysis(statisticsReport, overallSlice),
    evaluationCross: statisticsReport.evaluationCross,
    evaluationOutcomeCross: buildEvaluationOutcomeCross(statisticsReport),
    byExitReason: buildExitReasonAnalysis(statisticsReport),
    durationSummary: statisticsReport.duration,
    byDurationBucket,
    combined,
    highestObservedWinRates,
    descriptiveNotes: [],
  };

  draft.descriptiveNotes = buildDescriptiveNotes(draft);

  return draft;
}
