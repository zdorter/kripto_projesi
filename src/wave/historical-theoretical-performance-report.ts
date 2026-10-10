import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
} from "./setup/historical-measurement-contract";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { TheoreticalRDecisiveTradeAuditRow } from "./historical-independent-trade-r-eligibility-audit-types";
import type { IndependentTradeRMultipleSliceStatistics } from "./historical-independent-trade-r-multiple-statistics-types";
import type { HistoricalIndependentTradeRMultipleStatisticsReport } from "./historical-independent-trade-r-multiple-statistics-types";
import { resolveIndependentTradeDirectionSliceKey } from "./historical-independent-trade-statistics";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticalValidationReport } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION,
  THEORETICAL_PERFORMANCE_EXPECTANCY_TOLERANCE,
  THEORETICAL_PERFORMANCE_LOSS_R_TOLERANCE,
  type BuildHistoricalTheoreticalPerformanceReportInput,
  type HistoricalTheoreticalPerformanceReport,
  type TheoreticalPerformanceBreakEven,
  type TheoreticalPerformanceByCohort,
  type TheoreticalPerformanceByDirection,
  type TheoreticalPerformanceByDuration,
  type TheoreticalPerformanceByEvaluation,
  type TheoreticalPerformanceByRrBucket,
  type TheoreticalPerformanceBySetupFamily,
  type TheoreticalPerformanceDimensionSlice,
  type TheoreticalPerformanceExitReasonSlice,
  type TheoreticalPerformanceInterpretationFlag,
  type TheoreticalPerformanceOverall,
  type TheoreticalPerformanceRDistribution,
  type TheoreticalPerformanceStatisticalContext,
  type TheoreticalPerformanceWinLossSide,
} from "./historical-theoretical-performance-report-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

const REFERENCE_BTC = {
  snapshots: 18990,
  eligible: 2951,
  trades: 340,
  wins: 131,
  losses: 154,
  inconclusive: 8,
  unresolved: 47,
  decisive: 285,
  validR: 269,
  unavailableR: 16,
} as const;

const EVALUATION_STATUSES: readonly Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>[] = ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

const EXIT_LABELS: Record<ProspectiveSetupOutcomeReplayStatus, string> = {
  TARGET_TOUCHED: "TARGET",
  INVALIDATION_TOUCHED: "INVALIDATION",
  AMBIGUOUS: "AMBIGUOUS",
  NO_TOUCH: "NO_TOUCH",
  NO_FUTURE_DATA: "NO_FUTURE_DATA",
  INSUFFICIENT_CONTEXT: "INSUFFICIENT_CONTEXT",
};

function quantile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) {
    return null;
  }
  if (sorted.length === 1) {
    return sorted[0]!;
  }
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) {
    return sorted[lo]!;
  }
  const w = pos - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
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

function assertParity(
  statisticsReport: IndependentTradeStatisticsReport,
  rReport: HistoricalIndependentTradeRMultipleStatisticsReport,
  audit: HistoricalIndependentTradeREligibilityAuditReport
): void {
  const c = statisticsReport.overall.counts;
  const o = rReport.overall;
  if (
    c.totalTrades !== o.totalTrades ||
    c.wins !== o.wins ||
    c.losses !== o.losses ||
    c.inconclusiveSameBar !== o.inconclusive ||
    c.unresolvedAtHorizon !== o.unresolved ||
    c.decisiveResolutions !== o.decisiveTrades
  ) {
    throw new Error(
      "B-12i: statisticsReport and rMultipleStatisticsReport outcome parity failed"
    );
  }
  if (
    audit.decisiveParity.decisiveTrades !== o.decisiveTrades ||
    audit.decisiveParity.validTheoreticalRTrades !== o.tradesWithTheoreticalR ||
    audit.decisiveParity.decisiveWithoutTheoreticalR !==
      o.decisiveWithoutTheoreticalR
  ) {
    throw new Error("B-12i: eligibility audit and rMultiple parity failed");
  }
}

function collectRValues(
  audit: HistoricalIndependentTradeREligibilityAuditReport
): number[] {
  return audit.decisiveRows
    .filter((r) => r.theoreticalR !== null)
    .map((r) => r.theoreticalR!);
}

function grossFromRows(rows: readonly TheoreticalRDecisiveTradeAuditRow[]): {
  grossPositiveR: number;
  grossNegativeR: number;
} {
  let grossPositiveR = 0;
  let grossNegativeR = 0;
  for (const row of rows) {
    const r = row.theoreticalR;
    if (r === null) {
      continue;
    }
    if (r > 0) {
      grossPositiveR += r;
    } else if (r < 0) {
      grossNegativeR += r;
    }
  }
  return { grossPositiveR, grossNegativeR };
}

function buildRDistribution(values: number[]): TheoreticalPerformanceRDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  const positiveRCount = values.filter((v) => v > 0).length;
  const negativeRCount = values.filter((v) => v < 0).length;
  const zeroRCount = values.filter((v) => v === 0).length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length ? sum / values.length : null;
  const median = quantile(sorted, 0.5);
  const p75 = quantile(sorted, 0.75);
  const p25 = quantile(sorted, 0.25);
  const iqr = p75 !== null && p25 !== null ? p75 - p25 : null;
  let outlierHigh: number | null = null;
  let outlierLow: number | null = null;
  if (iqr !== null && p75 !== null && p25 !== null) {
    const hiFence = p75 + 1.5 * iqr;
    const loFence = p25 - 1.5 * iqr;
    const highs = sorted.filter((v) => v > hiFence);
    const lows = sorted.filter((v) => v < loFence);
    outlierHigh = highs.length ? Math.max(...highs) : null;
    outlierLow = lows.length ? Math.min(...lows) : null;
  }
  return {
    positiveRCount,
    negativeRCount,
    zeroRCount,
    average: avg,
    median,
    min: sorted.length ? sorted[0]! : null,
    max: sorted.length ? sorted[sorted.length - 1]! : null,
    p10: quantile(sorted, 0.1),
    p25,
    p50: median,
    p75,
    p90: quantile(sorted, 0.9),
    outlierHighR: outlierHigh,
    outlierLowR: outlierLow,
  };
}

function buildWinLossSide(
  rows: readonly TheoreticalRDecisiveTradeAuditRow[],
  side: "win" | "loss",
  decisiveTrades: number
): TheoreticalPerformanceWinLossSide {
  const filtered = rows.filter((r) =>
    side === "win" ? r.observedWin : r.observedLoss
  );
  const rValues = filtered
    .filter((r) => r.theoreticalR !== null)
    .map((r) => r.theoreticalR!);
  const sorted = [...rValues].sort((a, b) => a - b);
  const count = filtered.length;
  const rate = {
    numerator: count,
    denominator: decisiveTrades,
    value: decisiveTrades === 0 ? null : count / decisiveTrades,
    denominatorId: "DECISIVE_RESOLUTIONS" as const,
  };
  let lossRInvariantHolds: boolean | null = null;
  if (side === "loss" && rValues.length > 0) {
    lossRInvariantHolds = rValues.every(
      (v) => Math.abs(v - -1) <= THEORETICAL_PERFORMANCE_LOSS_R_TOLERANCE
    );
  }
  const sum = rValues.reduce((a, b) => a + b, 0);
  return {
    count,
    rate,
    averageR: rValues.length ? sum / rValues.length : null,
    medianR: quantile(sorted, 0.5),
    minR: sorted.length ? sorted[0]! : null,
    maxR: sorted.length ? sorted[sorted.length - 1]! : null,
    lossRInvariantHolds,
  };
}

function mapSlice(
  slice: IndependentTradeRMultipleSliceStatistics,
  overallWinRate: number | null,
  overallExpectancy: number | null,
  averageDurationBars: number | null
): TheoreticalPerformanceDimensionSlice {
  const quality = classifyHistoricalIndependentTradeSampleSize(slice.decisive);
  const winRateValue = slice.winRate.value;
  return {
    trades: slice.sampleSize,
    decisive: slice.decisive,
    wins: slice.wins,
    losses: slice.losses,
    winRate: slice.winRate,
    averageWinR: slice.averageWinR,
    averageLossR: slice.averageLossR,
    expectancyR: slice.expectancyR,
    profitFactorR: slice.profitFactorR,
    sumR: slice.sumR,
    sampleSizeQuality: quality,
    interpretWithCaution:
      quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
    winRateDeltaFromOverall:
      winRateValue === null || overallWinRate === null
        ? null
        : winRateValue - overallWinRate,
    expectancyDeltaFromOverall:
      slice.expectancyR === null || overallExpectancy === null
        ? null
        : slice.expectancyR - overallExpectancy,
    averageDurationBars,
  };
}

function averageDurationForTrades(
  trades: readonly IndependentTradeUnit[],
  predicate: (t: IndependentTradeUnit) => boolean
): number | null {
  const durations = trades
    .filter(predicate)
    .map((t) => t.lifecycleDurationBars)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  if (!durations.length) {
    return null;
  }
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function buildDurationSlices(
  lifecycle: IndependentTradeLifecycleReport | undefined,
  audit: HistoricalIndependentTradeREligibilityAuditReport,
  overallWinRate: number | null,
  overallExpectancy: number | null
): TheoreticalPerformanceByDuration {
  const byId = Object.fromEntries(
    INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((id) => [id, [] as number[]])
  ) as Record<IndependentTradeDurationBucketId, number[]>;
  const bucketMeta = Object.fromEntries(
    INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((id) => [
      id,
      { wins: 0, losses: 0, trades: 0, sumR: 0, decisive: 0 },
    ])
  ) as Record<
    IndependentTradeDurationBucketId,
    { wins: number; losses: number; trades: number; sumR: number; decisive: number }
  >;

  const tradeById = new Map(
    (lifecycle?.trades ?? []).map((t) => [t.tradeId, t])
  );

  for (const row of audit.decisiveRows) {
    const trade = tradeById.get(row.tradeId);
    const bucket = trade
      ? resolveDurationBucket(trade.lifecycleDurationBars)
      : resolveDurationBucket(row.lifecycleDurationBars);
    if (!bucket) {
      continue;
    }
    bucketMeta[bucket].trades += 1;
    if (row.observedWin) {
      bucketMeta[bucket].wins += 1;
      bucketMeta[bucket].decisive += 1;
    }
    if (row.observedLoss) {
      bucketMeta[bucket].losses += 1;
      bucketMeta[bucket].decisive += 1;
    }
    if (row.theoreticalR !== null) {
      byId[bucket].push(row.theoreticalR);
      bucketMeta[bucket].sumR += row.theoreticalR;
    }
  }

  const result = {} as TheoreticalPerformanceByDuration;
  for (const id of INDEPENDENT_TRADE_DURATION_BUCKET_IDS) {
    const m = bucketMeta[id];
    const rVals = byId[id];
    const quality = classifyHistoricalIndependentTradeSampleSize(m.decisive);
    const winRate = {
      numerator: m.wins,
      denominator: m.decisive,
      value: m.decisive === 0 ? null : m.wins / m.decisive,
      denominatorId: "DECISIVE_RESOLUTIONS" as const,
    };
    result[id] = {
      trades: m.trades,
      decisive: m.decisive,
      wins: m.wins,
      losses: m.losses,
      winRate,
      averageWinR: null,
      averageLossR: null,
      expectancyR: m.decisive === 0 ? null : m.sumR / m.decisive,
      profitFactorR: null,
      sumR: m.sumR,
      sampleSizeQuality: quality,
      interpretWithCaution:
        quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
      winRateDeltaFromOverall:
        winRate.value === null || overallWinRate === null
          ? null
          : winRate.value - overallWinRate,
      expectancyDeltaFromOverall:
        m.decisive === 0 || overallExpectancy === null
          ? null
          : m.sumR / m.decisive - overallExpectancy,
      averageDurationBars: null,
      averageR: rVals.length
        ? rVals.reduce((a, b) => a + b, 0) / rVals.length
        : null,
    };
  }
  return result;
}

function buildInterpretationFlags(
  overall: TheoreticalPerformanceOverall,
  invalidPct: number | null
): HistoricalTheoreticalPerformanceReport["interpretationFlags"] {
  const definitions: Record<TheoreticalPerformanceInterpretationFlag, string> = {
    POSITIVE_EXPECTANCY:
      "expectancyR > 0 (teorik R ortalaması pozitif; gerçek kârlılık iddiası değildir).",
    NEGATIVE_EXPECTANCY:
      "expectancyR < 0 (teorik R ortalaması negatif; gerçek kârlılık iddiası değildir).",
    ZERO_EXPECTANCY: "expectancyR === 0 veya yok.",
    INSUFFICIENT_R_DATA:
      "validTheoreticalRTrades çok düşük veya expectancy hesaplanamıyor.",
    HIGH_INVALID_GEOMETRY_RATE:
      "decisiveWithoutTheoreticalR / decisiveTrades oranı yükselmiş (B-12h).",
  };
  const flags: TheoreticalPerformanceInterpretationFlag[] = [];
  const exp = overall.expectancyR;
  if (exp === null || overall.validTheoreticalRTrades === 0) {
    flags.push("INSUFFICIENT_R_DATA");
  } else if (exp > 0) {
    flags.push("POSITIVE_EXPECTANCY");
  } else if (exp < 0) {
    flags.push("NEGATIVE_EXPECTANCY");
  } else {
    flags.push("ZERO_EXPECTANCY");
  }
  if (invalidPct !== null && invalidPct > 0.05) {
    flags.push("HIGH_INVALID_GEOMETRY_RATE");
  }
  return { flags, definitions };
}

/**
 * B-12i: B-12g/B-12h çıktılarını tüketen tarihsel teorik performans raporu (read-only).
 */
export function buildHistoricalTheoreticalPerformanceReport(
  input: BuildHistoricalTheoreticalPerformanceReportInput
): HistoricalTheoreticalPerformanceReport {
  const {
    statisticsReport,
    rMultipleStatisticsReport: rReport,
    eligibilityAuditReport: audit,
    lifecycleReport,
    validationReport,
  } = input;

  assertParity(statisticsReport, rReport, audit);

  const o = rReport.overall;
  const { grossPositiveR, grossNegativeR } = grossFromRows(audit.decisiveRows);
  const expDelta =
    o.expectancyR === null || o.expectancyRFromWinLossComponents === null
      ? null
      : o.expectancyR - o.expectancyRFromWinLossComponents;
  const expectancyValidation =
    expDelta === null
      ? "INCONSISTENT"
      : Math.abs(expDelta) <= THEORETICAL_PERFORMANCE_EXPECTANCY_TOLERANCE
        ? "CONSISTENT"
        : "INCONSISTENT";

  const overall: TheoreticalPerformanceOverall = {
    totalTrades: o.totalTrades,
    decisiveTrades: o.decisiveTrades,
    wins: o.wins,
    losses: o.losses,
    inconclusive: o.inconclusive,
    unresolved: o.unresolved,
    validTheoreticalRTrades: o.tradesWithTheoreticalR,
    decisiveWithoutTheoreticalR: o.decisiveWithoutTheoreticalR,
    invalidRiskTrades: o.invalidRiskTrades,
    sumR: o.sumR,
    averageR: o.averageR,
    medianR: o.medianR,
    minR: o.minR,
    maxR: o.maxR,
    averageWinR: o.averageWinR,
    averageLossR: o.averageLossR,
    grossPositiveR,
    grossNegativeR,
    profitFactorR: o.profitFactorR,
    winRateDecisive: o.winRateDecisive,
    lossRateDecisive: o.lossRateDecisive,
    expectancyR: o.expectancyR,
    expectancyRFromComponents: o.expectancyRFromWinLossComponents,
    expectancyValidation,
    expectancyValidationDelta: expDelta,
  };

  const rValues = collectRValues(audit);
  const rDistribution = buildRDistribution(rValues);
  const decisiveRows = audit.decisiveRows;
  const winAnalysis = buildWinLossSide(decisiveRows, "win", o.decisiveTrades);
  const lossAnalysis = buildWinLossSide(decisiveRows, "loss", o.decisiveTrades);

  let breakEvenWinRate: number | null = null;
  const avgWin = o.averageWinR;
  const avgLoss = o.averageLossR;
  if (
    avgWin !== null &&
    avgLoss !== null &&
    avgWin > 0 &&
    avgLoss < 0
  ) {
    breakEvenWinRate =
      Math.abs(avgLoss) / (avgWin + Math.abs(avgLoss));
  }
  const actualWinRate = o.winRateDecisive.value;
  const breakEven: TheoreticalPerformanceBreakEven = {
    breakEvenWinRate,
    actualWinRate,
    edgeOverBreakEven:
      breakEvenWinRate === null || actualWinRate === null
        ? null
        : actualWinRate - breakEvenWinRate,
    note:
      "Teorik R aritmetiği; PnL veya gerçek kârlılık iddiası değildir (başabaş win rate).",
  };

  const overallWinRate = actualWinRate;
  const overallExpectancy = o.expectancyR;

  const trades = lifecycleReport?.trades ?? [];
  const byDirection = {} as TheoreticalPerformanceByDirection;
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    const slice = rReport.byDirection[key];
    const dur = averageDurationForTrades(
      trades,
      (t) => resolveIndependentTradeDirectionSliceKey(t) === key
    );
    byDirection[key] = mapSlice(slice, overallWinRate, overallExpectancy, dur);
  }

  const byRrBucket = {} as TheoreticalPerformanceByRrBucket;
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    byRrBucket[row] = mapSlice(
      rReport.byRrBucket[row],
      overallWinRate,
      overallExpectancy,
      null
    );
  }

  const byEvaluation = {} as TheoreticalPerformanceByEvaluation;
  for (const status of EVALUATION_STATUSES) {
    const slice = rReport.byEvaluation[status];
    const obs =
      slice.decisive < 30
        ? "INSUFFICIENT_SAMPLE"
        : "OBSERVATIONAL_DIFFERENCE";
    byEvaluation[status] = {
      ...mapSlice(slice, overallWinRate, overallExpectancy, null),
      evaluatorObservation: obs,
    };
  }

  const bySetupFamily: TheoreticalPerformanceBySetupFamily = {};
  const familyKeys = Object.keys(rReport.bySetupFamily).sort();
  for (const key of familyKeys) {
    bySetupFamily[key] = mapSlice(
      rReport.bySetupFamily[key],
      overallWinRate,
      overallExpectancy,
      null
    );
  }

  const byExitReason: TheoreticalPerformanceExitReasonSlice[] = [];
  for (const outcome of [
    "TARGET_TOUCHED",
    "INVALIDATION_TOUCHED",
    "AMBIGUOUS",
    "NO_TOUCH",
  ] as const) {
    const slice = rReport.byExitReason[outcome];
    const quality = classifyHistoricalIndependentTradeSampleSize(slice.decisive);
    byExitReason.push({
      pathOutcome: outcome,
      label: EXIT_LABELS[outcome],
      trades: slice.sampleSize,
      decisive: slice.decisive,
      wins: slice.wins,
      losses: slice.losses,
      winRate: slice.winRate,
      expectancyR: slice.expectancyR,
      profitFactorR: slice.profitFactorR,
      sampleSizeQuality: quality,
    });
  }

  const byDuration = buildDurationSlices(
    lifecycleReport,
    audit,
    overallWinRate,
    overallExpectancy
  );

  const byCohort = {} as TheoreticalPerformanceByCohort;
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    byCohort[cohort] = mapSlice(
      rReport.byCohort[cohort],
      overallWinRate,
      overallExpectancy,
      null
    );
  }

  const unavailable = o.decisiveWithoutTheoreticalR;
  const invalidPct =
    o.decisiveTrades === 0 ? null : unavailable / o.decisiveTrades;
  const unavailableByGeometry: Record<string, number> = {};
  for (const row of audit.decisiveRows) {
    if (!row.theoreticalREligible) {
      unavailableByGeometry[row.geometryClassification] =
        (unavailableByGeometry[row.geometryClassification] ?? 0) + 1;
    }
  }

  const snap = statisticsReport.snapshotReference;
  const matchesReference =
    snap.independentTrades === REFERENCE_BTC.trades &&
    statisticsReport.overall.counts.decisiveResolutions ===
      REFERENCE_BTC.decisive &&
    o.tradesWithTheoreticalR === REFERENCE_BTC.validR;

  let statisticalContext: TheoreticalPerformanceStatisticalContext | null =
    null;
  if (validationReport) {
    const w = validationReport.overall.wins;
    const l = validationReport.overall.losses;
    const ci = validationReport.overall.confidenceInterval;
    statisticalContext = {
      overallWins: w,
      overallDecisive: w + l,
      overallWinRate: validationReport.overall.observedRate,
      wilson95Lower: ci.confidenceLevel === 0.95 ? ci.lower : null,
      wilson95Upper: ci.confidenceLevel === 0.95 ? ci.upper : null,
      baseline50pValue: validationReport.overall.baselineTest.pValue,
      significantAt95: validationReport.overall.baselineTest.significantAt95,
      note:
        "B-12e win-rate context; ayrı teorik R performansından (B-12g) bağımsız okunmalıdır.",
    };
  }

  return {
    schemaVersion: HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION,
    rMultipleContractVersion: rReport.rMultipleContractVersion,
    policyId: rReport.policyId,
    entryEventPolicyId: rReport.entryEventPolicyId,
    populationKind: "HISTORICAL_THEORETICAL_PERFORMANCE",
    consumedReports: {
      statisticsSchemaVersion: statisticsReport.statisticsSchemaVersion,
      rMultipleSchemaVersion: rReport.schemaVersion,
      eligibilityAuditSchemaVersion: audit.schemaVersion,
      validationSchemaVersion: validationReport?.configuration
        .validationSchemaVersion ?? null,
    },
    population: {
      snapshotReference: snap,
      referencePopulationNote:
        "Referans BTCUSDT 1H: 18990 snapshots, 2951 eligible, 340 trades, 285 decisive, 269 valid theoretical R, 16 unavailable.",
      liveDatasetDriftNote: matchesReference
        ? null
        : "Canlı dataset referans population ile tam örtüşmüyor; bu rapor mevcut run değerlerini yansıtır.",
    },
    overall,
    rDistribution,
    winAnalysis,
    lossAnalysis,
    breakEven,
    byDirection,
    byRrBucket,
    byEvaluation,
    bySetupFamily,
    byExitReason,
    byDuration,
    byCohort,
    prospectiveVsTheoreticalR: {
      prospectiveRrSource: "B-9d evaluation.references.rr.ratio (prospective RR)",
      theoreticalOutcomeRSource:
        "B-12g theoretical outcome R from frozen path/policy (WIN: reward/risk, LOSS: -1R)",
      note: rReport.prospectiveVsRealizedRNote,
      rrConsistencyFromAudit: {
        decisiveWithComparableRr: audit.rrConsistency.decisiveWithComparableRr,
        withinToleranceCount: audit.rrConsistency.withinToleranceCount,
        outsideToleranceCount: audit.rrConsistency.outsideToleranceCount,
      },
    },
    invalidGeometryImpact: {
      decisiveTrades: o.decisiveTrades,
      theoreticalRAvailable: o.tradesWithTheoreticalR,
      theoreticalRUnavailable: unavailable,
      percentageUnavailable: invalidPct,
      primaryRejectionReason: "INCONSISTENT_TARGET_DIRECTION",
      unavailableCountByGeometry: unavailableByGeometry,
    },
    populationViews: {
      canonicalTheoreticalRPopulation: {
        description:
          "B-12g canonical theoretical-R population (valid geometry only).",
        validTheoreticalRTrades: o.tradesWithTheoreticalR,
      },
      diagnosticDecisivePopulation: {
        description:
          "B-12c/B-10d decisive population (WIN+LOSS); R unavailable ayrı raporlanır.",
        decisiveTrades: o.decisiveTrades,
      },
    },
    statisticalContext,
    interpretationFlags: buildInterpretationFlags(overall, invalidPct),
    warnings: {
      historicalTheoreticalOnly:
        "Bu rapor yalnızca tarihsel teorik R performansını özetler.",
      noExecutionSimulation: "Emir gerçekleşme simülasyonu yok.",
      noFees: "Komisyon yok.",
      noSlippage: "Slippage yok.",
      noFunding: "Funding yok.",
      noPositionSizing: "Pozisyon büyüklüğü yok.",
      temporalDependence:
        "Bağımsız trade mutex zaman bağımlılığını ortadan kaldırmaz.",
      overlappingHistoricalObservations:
        "Cohort/snapshot overlap upstream olabilir.",
      regimeDependence: "Tek piyasa penceresi; rejim bağımlılığı göz önünde bulundurulmalı.",
      invalidGeometryExcludedFromR:
        "Geometri geçersiz decisive trade'ler theoretical R aggregate'ına dahil edilmez.",
      prospectiveRrIsNotRealizedR:
        "Prospective RR (B-9d) ≠ theoretical outcome R (B-12g).",
      notRealMoney: "Bu rapor gerçek para kazancını ölçmez.",
    },
  };
}
