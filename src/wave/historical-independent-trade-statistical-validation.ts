import { HISTORICAL_MEASUREMENT_COHORTS } from "./setup/historical-measurement-contract";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import { INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeStatisticsSlice } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeAnalysisReport } from "./historical-independent-trade-analysis-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  HISTORICAL_INDEPENDENT_TRADE_STATISTICAL_VALIDATION_SCHEMA_VERSION,
  INDEPENDENT_TRADE_CONFIDENCE_LEVELS,
  INDEPENDENT_TRADE_DEFAULT_ALPHA,
  INDEPENDENT_TRADE_DEFAULT_BASELINE_WIN_RATE,
  INDEPENDENT_TRADE_DEFAULT_CONFIDENCE_LEVEL,
  type IndependentTradeBaselineWinRateTest,
  type IndependentTradeConfidenceLevel,
  type IndependentTradeGroupWinRateComparison,
  type IndependentTradeStatisticalEvidenceLabel,
  type IndependentTradeStatisticalValidationConfiguration,
  type IndependentTradeStatisticalValidationReport,
  type IndependentTradeValidatedSlice,
  type IndependentTradeWinRateConfidenceInterval,
  type ValidateIndependentTradeStatisticsInput,
} from "./historical-independent-trade-statistical-validation-types";

export class IndependentTradeStatisticalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndependentTradeStatisticalValidationError";
  }
}

const PATH_OUTCOMES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

function zCritical(confidenceLevel: IndependentTradeConfidenceLevel): number {
  switch (confidenceLevel) {
    case 0.9:
      return 1.6448536269514722;
    case 0.95:
      return 1.959963984540054;
    case 0.99:
      return 2.5758293035489004;
    default:
      throw new IndependentTradeStatisticalValidationError(
        `Unsupported confidence level: ${confidenceLevel}`
      );
  }
}

function assertConfidenceLevel(
  level: number
): IndependentTradeConfidenceLevel {
  if (
    !INDEPENDENT_TRADE_CONFIDENCE_LEVELS.includes(
      level as IndependentTradeConfidenceLevel
    )
  ) {
    throw new IndependentTradeStatisticalValidationError(
      `confidenceLevel must be one of ${INDEPENDENT_TRADE_CONFIDENCE_LEVELS.join(", ")}`
    );
  }
  return level as IndependentTradeConfidenceLevel;
}

function assertBaselineRate(baseline: number): number {
  if (!Number.isFinite(baseline) || baseline <= 0 || baseline >= 1) {
    throw new IndependentTradeStatisticalValidationError(
      "baselineRate must be a finite number strictly between 0 and 1"
    );
  }
  return baseline;
}

function assertAlpha(alpha: number): number {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new IndependentTradeStatisticalValidationError(
      "alpha must be a finite number strictly between 0 and 1"
    );
  }
  return alpha;
}

function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

function binomialPmf(n: number, k: number, p: number): number {
  return binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k);
}

function normalSurvivalAbsZ(z: number): number {
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422804014327;
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = d * Math.exp(-0.5 * x * x);
  return pdf * poly;
}

export function classifyStatisticalEvidence(
  pValue: number | null,
  alpha: number
): IndependentTradeStatisticalEvidenceLabel {
  if (pValue === null) {
    return "INSUFFICIENT_SAMPLE";
  }
  return pValue < alpha ? "SIGNIFICANT_AT_ALPHA" : "NOT_SIGNIFICANT_AT_ALPHA";
}

export function computeIndependentTradeWinRateConfidenceInterval(
  favorable: number,
  adverse: number,
  confidenceLevel: number = INDEPENDENT_TRADE_DEFAULT_CONFIDENCE_LEVEL
): IndependentTradeWinRateConfidenceInterval {
  const level = assertConfidenceLevel(confidenceLevel);
  const wins = Math.floor(Number(favorable));
  const losses = Math.floor(Number(adverse));
  if (wins < 0 || losses < 0) {
    throw new IndependentTradeStatisticalValidationError(
      "favorable and adverse must be non-negative integers"
    );
  }
  const denominator = wins + losses;
  if (denominator === 0) {
    return {
      numerator: 0,
      denominator: 0,
      value: null,
      confidenceLevel: level,
      lower: null,
      upper: null,
      method: "WILSON_SCORE_INTERVAL",
    };
  }
  const n = denominator;
  const pHat = wins / n;
  const z = zCritical(level);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denom;
  const margin =
    (z / denom) *
    Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));
  const lower = Math.max(0, center - margin);
  const upper = Math.min(1, center + margin);
  return {
    numerator: wins,
    denominator,
    value: pHat,
    confidenceLevel: level,
    lower,
    upper,
    method: "WILSON_SCORE_INTERVAL",
  };
}

export function testIndependentTradeWinRateAgainstBaseline(
  favorable: number,
  adverse: number,
  baselineRate: number = INDEPENDENT_TRADE_DEFAULT_BASELINE_WIN_RATE,
  alpha: number = INDEPENDENT_TRADE_DEFAULT_ALPHA
): IndependentTradeBaselineWinRateTest {
  const p0 = assertBaselineRate(baselineRate);
  assertAlpha(alpha);
  const wins = Math.floor(Number(favorable));
  const losses = Math.floor(Number(adverse));
  if (wins < 0 || losses < 0) {
    throw new IndependentTradeStatisticalValidationError(
      "favorable and adverse must be non-negative integers"
    );
  }
  const n = wins + losses;
  if (n === 0) {
    return {
      numerator: 0,
      denominator: 0,
      observedRate: null,
      baselineRate: p0,
      pValue: null,
      testType: "EXACT_BINOMIAL_TWO_SIDED",
      significantAt95: false,
      alpha,
    };
  }
  const observedRate = wins / n;
  let lowerTail = 0;
  for (let k = 0; k <= wins; k++) {
    lowerTail += binomialPmf(n, k, p0);
  }
  let upperTail = 0;
  for (let k = wins; k <= n; k++) {
    upperTail += binomialPmf(n, k, p0);
  }
  const pValue = Math.min(1, 2 * Math.min(lowerTail, upperTail));
  return {
    numerator: wins,
    denominator: n,
    observedRate,
    baselineRate: p0,
    pValue,
    testType: "EXACT_BINOMIAL_TWO_SIDED",
    significantAt95: pValue < alpha,
    alpha,
  };
}

export function compareIndependentTradeGroups(
  groupA: { wins: number; losses: number },
  groupB: { wins: number; losses: number },
  alpha: number = INDEPENDENT_TRADE_DEFAULT_ALPHA
): IndependentTradeGroupWinRateComparison {
  assertAlpha(alpha);
  const winsA = Math.floor(groupA.wins);
  const lossesA = Math.floor(groupA.losses);
  const winsB = Math.floor(groupB.wins);
  const lossesB = Math.floor(groupB.losses);
  const nA = winsA + lossesA;
  const nB = winsB + lossesB;
  const rateA = nA === 0 ? null : winsA / nA;
  const rateB = nB === 0 ? null : winsB / nB;
  if (nA === 0 || nB === 0) {
    return {
      groupA: { wins: winsA, losses: lossesA, rate: rateA },
      groupB: { wins: winsB, losses: lossesB, rate: rateB },
      difference: null,
      pValue: null,
      significantAt95: false,
      alpha,
      method: "TWO_PROPORTION_Z_TEST_TWO_SIDED",
      evidenceLabel: "INSUFFICIENT_DECISIVE_SAMPLE",
    };
  }
  const p1 = winsA / nA;
  const p2 = winsB / nB;
  const pPool = (winsA + winsB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  const difference = p1 - p2;
  if (se === 0) {
    return {
      groupA: { wins: winsA, losses: lossesA, rate: rateA },
      groupB: { wins: winsB, losses: lossesB, rate: rateB },
      difference,
      pValue: difference === 0 ? 1 : 0,
      significantAt95: difference !== 0,
      alpha,
      method: "TWO_PROPORTION_Z_TEST_TWO_SIDED",
      evidenceLabel:
        difference === 0
          ? "NO_STATISTICAL_EVIDENCE_OF_DIFFERENCE"
          : "EVIDENCE_OF_DIFFERENCE",
    };
  }
  const z = difference / se;
  const pValue = 2 * normalSurvivalAbsZ(z);
  const significant = pValue < alpha;
  return {
    groupA: { wins: winsA, losses: lossesA, rate: rateA },
    groupB: { wins: winsB, losses: lossesB, rate: rateB },
    difference,
    pValue,
    significantAt95: significant,
    alpha,
    method: "TWO_PROPORTION_Z_TEST_TWO_SIDED",
    evidenceLabel: significant
      ? "EVIDENCE_OF_DIFFERENCE"
      : "NO_STATISTICAL_EVIDENCE_OF_DIFFERENCE",
  };
}

function sliceToWinsLosses(slice: IndependentTradeStatisticsSlice): {
  wins: number;
  losses: number;
} {
  return { wins: slice.counts.wins, losses: slice.counts.losses };
}

function exitReasonToWinsLosses(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  count: number
): { wins: number; losses: number } {
  switch (outcome) {
    case "TARGET_TOUCHED":
      return { wins: count, losses: 0 };
    case "INVALIDATION_TOUCHED":
      return { wins: 0, losses: count };
    default:
      return { wins: 0, losses: 0 };
  }
}

function buildValidatedSlice(
  wins: number,
  losses: number,
  overallRate: number | null,
  confidenceLevel: IndependentTradeConfidenceLevel,
  baselineRate: number,
  alpha: number
): IndependentTradeValidatedSlice {
  const decisive = wins + losses;
  const ci = computeIndependentTradeWinRateConfidenceInterval(
    wins,
    losses,
    confidenceLevel
  );
  const quality = classifyHistoricalIndependentTradeSampleSize(decisive);
  const observedRate = ci.value;
  return {
    sampleSize: decisive,
    wins,
    losses,
    decisiveResolutions: decisive,
    sampleSizeQuality: quality,
    interpretWithCaution:
      quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
    observedRate,
    confidenceInterval: ci,
    winRateDeltaFromBaseline:
      observedRate === null ? null : observedRate - baselineRate,
    winRateDeltaFromOverall:
      observedRate === null || overallRate === null
        ? null
        : observedRate - overallRate,
    baselineTest: testIndependentTradeWinRateAgainstBaseline(
      wins,
      losses,
      baselineRate,
      alpha
    ),
  };
}

function buildFromStatsSlice(
  slice: IndependentTradeStatisticsSlice,
  overallRate: number | null,
  confidenceLevel: IndependentTradeConfidenceLevel,
  baselineRate: number,
  alpha: number
): IndependentTradeValidatedSlice {
  const { wins, losses } = sliceToWinsLosses(slice);
  return buildValidatedSlice(
    wins,
    losses,
    overallRate,
    confidenceLevel,
    baselineRate,
    alpha
  );
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key]!;
  }
  return out;
}

function countTestsInReport(report: IndependentTradeStatisticalValidationReport): number {
  let n = 1;
  n += Object.keys(report.byDirection).length;
  n += Object.keys(report.byRrBucket).length;
  n += Object.keys(report.bySetupFamily).length;
  n += Object.keys(report.byEvaluation).length;
  n += Object.keys(report.byCohort).length;
  n += Object.keys(report.byExitReason).length;
  n += Object.keys(report.byDuration).length;
  n += 1;
  return n;
}

/**
 * B-12e: statistical validation of B-12c/B-12d independent trade outcomes (no new trades/paths).
 */
export function validateIndependentTradeStatistics(
  input: ValidateIndependentTradeStatisticsInput
): IndependentTradeStatisticalValidationReport {
  const statisticsReport = input.statisticsReport;
  const analysisReport = input.analysisReport;
  const confidenceLevel = assertConfidenceLevel(
    input.confidenceLevel ?? INDEPENDENT_TRADE_DEFAULT_CONFIDENCE_LEVEL
  );
  const baselineRate = assertBaselineRate(
    input.baselineRate ?? INDEPENDENT_TRADE_DEFAULT_BASELINE_WIN_RATE
  );
  const alpha = assertAlpha(input.alpha ?? INDEPENDENT_TRADE_DEFAULT_ALPHA);

  const overallSlice = statisticsReport.overall;
  const overallWins = overallSlice.counts.wins;
  const overallLosses = overallSlice.counts.losses;
  const overallRate = overallSlice.rates.winRate_decisive.value;

  const overall = buildValidatedSlice(
    overallWins,
    overallLosses,
    overallRate,
    confidenceLevel,
    baselineRate,
    alpha
  );

  const byDirection = {} as IndependentTradeStatisticalValidationReport["byDirection"];
  for (const key of HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS) {
    byDirection[key] = buildFromStatsSlice(
      statisticsReport.byDirection[key],
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const byRrBucket = {} as IndependentTradeStatisticalValidationReport["byRrBucket"];
  for (const row of HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS) {
    byRrBucket[row] = buildFromStatsSlice(
      statisticsReport.byRrBucket[row],
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const bySetupFamily: Record<string, IndependentTradeValidatedSlice> = {};
  for (const [key, slice] of Object.entries(statisticsReport.bySetupFamily)) {
    bySetupFamily[key] = buildFromStatsSlice(
      slice,
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const byEvaluation = {} as IndependentTradeStatisticalValidationReport["byEvaluation"];
  for (const status of INDEPENDENT_TRADE_STATISTICS_EVALUATION_ROWS) {
    const row = statisticsReport.evaluationCross[status];
    const wins = row.FAVORABLE_RESOLUTION;
    const losses = row.ADVERSE_RESOLUTION;
    byEvaluation[status] = buildValidatedSlice(
      wins,
      losses,
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const byCohort = {} as IndependentTradeStatisticalValidationReport["byCohort"];
  for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
    byCohort[cohort] = buildFromStatsSlice(
      statisticsReport.cohorts[cohort],
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const byExitReason = {} as IndependentTradeStatisticalValidationReport["byExitReason"];
  for (const outcome of PATH_OUTCOMES) {
    const count = statisticsReport.pathOutcomeDistribution[outcome];
    const { wins, losses } = exitReasonToWinsLosses(outcome, count);
    byExitReason[outcome] = buildValidatedSlice(
      wins,
      losses,
      overallRate,
      confidenceLevel,
      baselineRate,
      alpha
    );
  }

  const byDuration = {} as IndependentTradeStatisticalValidationReport["byDuration"];
  for (const bucket of INDEPENDENT_TRADE_DURATION_BUCKET_IDS) {
    if (analysisReport) {
      const m = analysisReport.byDurationBucket[bucket];
      byDuration[bucket] = buildValidatedSlice(
        m.wins,
        m.losses,
        overallRate,
        confidenceLevel,
        baselineRate,
        alpha
      );
    } else {
      byDuration[bucket] = buildValidatedSlice(
        0,
        0,
        overallRate,
        confidenceLevel,
        baselineRate,
        alpha
      );
    }
  }

  const passed = byEvaluation.PASSED;
  const failed = byEvaluation.FAILED;
  const evaluationComparison = {
    passedVsFailed: compareIndependentTradeGroups(
      { wins: passed.wins, losses: passed.losses },
      { wins: failed.wins, losses: failed.losses },
      alpha
    ),
  };

  const configuration: IndependentTradeStatisticalValidationConfiguration = {
    validationSchemaVersion:
      HISTORICAL_INDEPENDENT_TRADE_STATISTICAL_VALIDATION_SCHEMA_VERSION,
    confidenceLevel,
    baselineRate,
    alpha,
    policyId: statisticsReport.policyId,
    entryEventPolicyId: statisticsReport.entryEventPolicyId,
  };

  const draft: IndependentTradeStatisticalValidationReport = {
    configuration,
    snapshotReference: statisticsReport.snapshotReference,
    overall,
    baselineTest: overall.baselineTest,
    overallConfidenceInterval: overall.confidenceInterval,
    byDirection,
    byRrBucket,
    bySetupFamily: sortRecord(bySetupFamily),
    byEvaluation,
    byCohort,
    byExitReason,
    byDuration,
    evaluationComparison,
    warnings: {
      multipleComparisons: {
        testsPerformed: 0,
        warning: true,
        message:
          "Multiple subgroup tests increase false-positive risk; no multiplicity correction applied in B-12e v1.",
      },
      temporalDependence: {
        warning: true,
        message:
          "Independent trade (lifecycle mutex) does not imply statistical independence across time; same symbol/timeframe and serial market context may induce dependence.",
      },
      baselineNotProfitability: {
        message:
          "A 50% decisive win-rate baseline is a statistical reference only; it does not imply trading profitability (fees, slippage, RR, execution, and PnL are out of scope).",
      },
      notTradingRecommendation: {
        message:
          "Results are historically observed and statistically descriptive; they are not buy/sell signals or strategy recommendations.",
      },
    },
  };

  draft.warnings.multipleComparisons.testsPerformed = countTestsInReport(draft);

  return draft;
}
