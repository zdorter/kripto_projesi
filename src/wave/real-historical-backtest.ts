import { HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS } from "./setup/historical-measurement-contract";
import { validateHistoricalProductionWalkForwardRange } from "./historical-production-walk-forward";
import { assertHistoricalOhlcvDatasetValid } from "./historical-ohlcv-dataset-validation";
import { expectedBarDurationMsForWaveTimeframe } from "./historical-ohlcv-dataset-loader";
import { runHistoricalBacktest } from "./historical-backtest";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  REAL_HISTORICAL_BACKTEST_SCHEMA_VERSION,
  type RealHistoricalBacktestEvaluationRange,
  type RealHistoricalBacktestPathOutcomeCounts,
  type RealHistoricalBacktestResult,
  type RunRealHistoricalBacktestInput,
} from "./real-historical-backtest-types";

/**
 * B-8c walk-forward range with full horizon window at endEvaluationBar.
 * Leaves candles[E+1 .. E+horizon] inside the series when E = end.
 */
export function resolveRealHistoricalBacktestEvaluationRange(
  candleCount: number,
  horizonBars: number,
  startEvaluationBar?: number
): RealHistoricalBacktestEvaluationRange {
  const horizon = Math.floor(horizonBars);
  if (!Number.isFinite(horizon) || horizon < 1) {
    throw new Error("horizonBars must be a positive integer");
  }
  const lastIndex = candleCount - 1;
  const endEvaluationBar = lastIndex - horizon;
  const start =
    startEvaluationBar !== undefined ? Math.floor(startEvaluationBar) : 0;
  const rationale =
    startEvaluationBar !== undefined
      ? "explicit startEvaluationBar from caller"
      : "B-8c minimum start (0); early bars may yield fewer candidates";

  if (endEvaluationBar < 0) {
    throw new Error(
      `insufficient candles (${candleCount}) for horizon ${horizon}`
    );
  }
  if (start > endEvaluationBar) {
    throw new Error("startEvaluationBar exceeds endEvaluationBar");
  }

  return {
    startEvaluationBar: start,
    endEvaluationBar,
    horizonBars: horizon,
    startEvaluationBarRationale: rationale,
  };
}

function countPathOutcomes(
  outcomes: readonly ProspectiveSetupOutcomeReplayStatus[]
): RealHistoricalBacktestPathOutcomeCounts {
  const counts: RealHistoricalBacktestPathOutcomeCounts = {
    TARGET_TOUCHED: 0,
    INVALIDATION_TOUCHED: 0,
    AMBIGUOUS: 0,
    NO_TOUCH: 0,
    NO_FUTURE_DATA: 0,
    INSUFFICIENT_CONTEXT: 0,
  };
  for (const o of outcomes) {
    counts[o] += 1;
  }
  return counts;
}

/**
 * B-11 integration: validated candles → B-10f runHistoricalBacktest (no network).
 */
export function runRealHistoricalBacktest(
  input: RunRealHistoricalBacktestInput
): RealHistoricalBacktestResult {
  const horizonBars =
    input.horizonBars ?? HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS;
  const mappedMs = expectedBarDurationMsForWaveTimeframe(input.timeframeId);
  let expectedBarDurationMs: number | undefined;
  if (
    mappedMs !== null &&
    input.candles.length >= 2 &&
    input.candles[1].time - input.candles[0].time === mappedMs
  ) {
    expectedBarDurationMs = mappedMs;
  }
  const validation = assertHistoricalOhlcvDatasetValid({
    candles: input.candles,
    expectedBarDurationMs,
  });

  const resolved = resolveRealHistoricalBacktestEvaluationRange(
    input.candles.length,
    horizonBars,
    input.startEvaluationBar
  );
  const startEvaluationBar =
    input.startEvaluationBar ?? resolved.startEvaluationBar;
  const endEvaluationBar =
    input.endEvaluationBar ?? resolved.endEvaluationBar;

  const rangeCheck = validateHistoricalProductionWalkForwardRange(
    [...input.candles],
    startEvaluationBar,
    endEvaluationBar
  );
  if (!rangeCheck.ok) {
    throw new Error(`evaluation range invalid: ${rangeCheck.error}`);
  }

  const report = runHistoricalBacktest({
    symbol: input.symbol,
    timeframeId: input.timeframeId,
    candles: input.candles,
    startEvaluationBar,
    endEvaluationBar,
    horizonBars,
    policyId: POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
    engineOptions: input.engineOptions,
  });

  const pathOutcomes = report.pathBatch.results.map((r) => r.outcome);

  return {
    schemaVersion: REAL_HISTORICAL_BACKTEST_SCHEMA_VERSION,
    dataset: {
      symbol: input.symbol,
      timeframeId: input.timeframeId,
      candleCount: input.candles.length,
      firstTime: validation.firstTime!,
      lastTime: validation.lastTime!,
      validation,
    },
    evaluationRange: {
      ...resolved,
      startEvaluationBar,
      endEvaluationBar,
    },
    report,
    pathOutcomeCounts: countPathOutcomes(pathOutcomes),
  };
}
