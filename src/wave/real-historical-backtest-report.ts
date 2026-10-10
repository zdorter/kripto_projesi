import type { HistoricalPositionOutcomeStatisticsSlice } from "./historical-position-outcome-statistics-types";
import { HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS } from "./setup/historical-measurement-contract";
import type { RealHistoricalBacktestResult } from "./real-historical-backtest-types";

function sliceLine(label: string, slice: HistoricalPositionOutcomeStatisticsSlice): string {
  const c = slice.counts;
  const wr = slice.rates.winRate_decisive.value;
  const wrText = wr === null ? "n/a" : `${(wr * 100).toFixed(2)}%`;
  return [
    `  ${label}:`,
    `    snapshots=${c.totalSnapshots} measured=${c.measuredPaths} wins=${c.wins} losses=${c.losses}`,
    `    decisive=${c.decisiveResolutions} winRate_decisive=${wrText}`,
  ].join("\n");
}

function formatIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Human-readable B-11 summary (statistics only; no PnL).
 */
export function formatRealHistoricalBacktestReport(
  result: RealHistoricalBacktestResult
): string {
  const { dataset, evaluationRange, report, pathOutcomeCounts } = result;
  const stats = report.outcomeStatistics;
  const overall = stats.overall.counts;
  const wr = stats.overall.rates.winRate_decisive.value;
  const wrText = wr === null ? "n/a" : `${(wr * 100).toFixed(2)}%`;

  const lines: string[] = [
    `${dataset.symbol} ${dataset.timeframeId}`,
    `Historical range (candles): ${formatIso(dataset.firstTime)} .. ${formatIso(dataset.lastTime)}`,
    `Evaluation bars: E=${evaluationRange.startEvaluationBar}..${evaluationRange.endEvaluationBar} (${evaluationRange.startEvaluationBarRationale})`,
    `Horizon: ${evaluationRange.horizonBars}`,
    `Policy: ${report.configuration.policyId}`,
    "",
    `Candle count: ${dataset.candleCount}`,
    `Evaluated evaluation bars: ${report.configuration.evaluatedEvaluationBars}`,
    "",
    `Snapshots: ${overall.totalSnapshots}`,
    `Measured paths: ${overall.measuredPaths}`,
    `Unmeasured paths: ${overall.unmeasuredPaths}`,
    "",
    `WIN (FAVORABLE): ${overall.wins}`,
    `LOSS (ADVERSE): ${overall.losses}`,
    `Decisive resolutions: ${overall.decisiveResolutions}`,
    `Win rate (decisive): ${wrText}`,
    "",
    `INCONCLUSIVE_SAME_BAR: ${overall.inconclusiveSameBar}`,
    `UNRESOLVED_AT_HORIZON: ${overall.unresolvedAtHorizon}`,
    `UNMEASURED_NO_FUTURE: ${overall.unmeasuredNoFuture}`,
    `UNMEASURED_INSUFFICIENT: ${overall.unmeasuredInsufficient}`,
    "",
    "Path outcomes (B-6 replay status):",
    `  TARGET_TOUCHED: ${pathOutcomeCounts.TARGET_TOUCHED}`,
    `  INVALIDATION_TOUCHED: ${pathOutcomeCounts.INVALIDATION_TOUCHED}`,
    `  AMBIGUOUS: ${pathOutcomeCounts.AMBIGUOUS}`,
    `  NO_TOUCH: ${pathOutcomeCounts.NO_TOUCH}`,
    `  NO_FUTURE_DATA: ${pathOutcomeCounts.NO_FUTURE_DATA}`,
    `  INSUFFICIENT_CONTEXT: ${pathOutcomeCounts.INSUFFICIENT_CONTEXT}`,
    "",
    "=== Setup family ===",
  ];

  for (const [family, slice] of Object.entries(stats.bySetupFamily).sort(
    (a, b) => b[1].counts.totalSnapshots - a[1].counts.totalSnapshots
  )) {
    if (slice.counts.totalSnapshots > 0) {
      lines.push(sliceLine(family, slice));
    }
  }

  lines.push("", "=== Direction ===");
  for (const key of ["BULLISH", "BEARISH", "UNRESOLVED", "UNKNOWN"] as const) {
    const slice = stats.byDirection[key];
    if (slice.counts.totalSnapshots > 0) {
      lines.push(sliceLine(key, slice));
    }
  }

  lines.push("", "=== RR bucket ===");
  for (const [bucket, slice] of Object.entries(stats.byRrBucket)) {
    if (slice.counts.totalSnapshots > 0) {
      lines.push(sliceLine(bucket, slice));
    }
  }

  lines.push("", "=== Cohort (overlapping; do not sum) ===");
  for (const cohort of Object.keys(HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS)) {
    const slice = stats.cohorts[cohort as keyof typeof stats.cohorts];
    if (slice.counts.totalSnapshots > 0) {
      lines.push(sliceLine(cohort, slice));
    }
  }

  lines.push("", "=== Trade evaluation × policy outcome ===");
  for (const evalStatus of ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"] as const) {
    const row = stats.evaluationCross[evalStatus];
    lines.push(
      `  ${evalStatus}: FAVORABLE=${row.FAVORABLE_RESOLUTION} ADVERSE=${row.ADVERSE_RESOLUTION} INCONCLUSIVE=${row.INCONCLUSIVE_SAME_BAR} UNRESOLVED=${row.UNRESOLVED_AT_HORIZON} UNMEASURED_NO_FUTURE=${row.UNMEASURED_NO_FUTURE} UNMEASURED_INSUFFICIENT=${row.UNMEASURED_INSUFFICIENT}`
    );
  }

  lines.push("", `Symbol slice: ${sliceLine(dataset.symbol, stats.bySymbol[dataset.symbol] ?? stats.overall)}`);
  lines.push(
    `Timeframe slice: ${sliceLine(dataset.timeframeId, stats.byTimeframe[dataset.timeframeId] ?? stats.overall)}`
  );

  return lines.join("\n");
}
