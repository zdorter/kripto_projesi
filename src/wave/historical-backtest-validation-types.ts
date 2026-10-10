import type { HistoricalBacktestReport } from "./historical-backtest-types";
import type { HistoricalPositionOutcomeStatisticsCounts } from "./historical-position-outcome-statistics-types";
import type { Candle } from "./types";

export const HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION = "1.0" as const;

/** DEMO_OHLCV has 24 candles (indices 0–23). */
export const HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE = {
  startEvaluationBar: 20,
  endEvaluationBar: 23,
  horizonBars: 24,
} as const;

export type HistoricalBacktestValidationIssueCode =
  | "B6_REPLAY_PATH_MISMATCH"
  | "DECISIVE_CANDLE_SEMANTICS"
  | "POLICY_CLASSIFICATION_MISMATCH"
  | "WIN_RATE_ARITHMETIC"
  | "DENOMINATOR_INVARIANT"
  | "COHORT_POPULATION";

export interface HistoricalBacktestValidationIssue {
  code: HistoricalBacktestValidationIssueCode;
  snapshotId: string;
  message: string;
}

export interface HistoricalBacktestValidationSummary {
  totalSnapshots: number;
  measuredPaths: number;
  unmeasuredPaths: number;
  favorableResolutions: number;
  adverseResolutions: number;
  wins: number;
  losses: number;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredNoFuture: number;
  unmeasuredInsufficient: number;
  decisiveResolutions: number;
  winRate_decisive: number | null;
  ambiguousSamplesFound: number;
  noFutureDataSamplesFound: number;
  insufficientContextSamplesFound: number;
}

export interface HistoricalBacktestDecisiveSample {
  snapshotId: string;
  evaluationBarIndex: number;
  prospectiveSetupId: string;
  direction: "BULLISH" | "BEARISH" | null;
  pathOutcome: string;
  policyClassification: string;
  resolutionBarIndex: number | null;
  barsAfterEvaluation: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  decisiveCandleHigh: number | null;
  decisiveCandleLow: number | null;
}

export interface HistoricalBacktestAuditInput {
  report: HistoricalBacktestReport;
  candles: readonly Candle[];
}

export interface HistoricalBacktestAuditResult {
  validationSchemaVersion: typeof HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION;
  summary: HistoricalBacktestValidationSummary;
  issues: HistoricalBacktestValidationIssue[];
  winSamples: HistoricalBacktestDecisiveSample[];
  lossSamples: HistoricalBacktestDecisiveSample[];
  ambiguousSamples: HistoricalBacktestDecisiveSample[];
  naturalAmbiguousFixtureFound: boolean;
}

export function summarizeHistoricalBacktestCounts(
  counts: HistoricalPositionOutcomeStatisticsCounts,
  winRateValue: number | null
): HistoricalBacktestValidationSummary {
  return {
    totalSnapshots: counts.totalSnapshots,
    measuredPaths: counts.measuredPaths,
    unmeasuredPaths: counts.unmeasuredPaths,
    favorableResolutions: counts.favorableResolutions,
    adverseResolutions: counts.adverseResolutions,
    wins: counts.wins,
    losses: counts.losses,
    inconclusiveSameBar: counts.inconclusiveSameBar,
    unresolvedAtHorizon: counts.unresolvedAtHorizon,
    unmeasuredNoFuture: counts.unmeasuredNoFuture,
    unmeasuredInsufficient: counts.unmeasuredInsufficient,
    decisiveResolutions: counts.decisiveResolutions,
    winRate_decisive: winRateValue,
    ambiguousSamplesFound: 0,
    noFutureDataSamplesFound: 0,
    insufficientContextSamplesFound: 0,
  };
}
