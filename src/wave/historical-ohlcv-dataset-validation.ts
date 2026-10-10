import type { Candle } from "./types";
import {
  HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION,
  type HistoricalOhlcvDatasetValidationInput,
  type HistoricalOhlcvDatasetValidationIssue,
  type HistoricalOhlcvDatasetValidationResult,
} from "./historical-ohlcv-dataset-validation-types";

export class HistoricalOhlcvDatasetValidationError extends Error {
  readonly issues: readonly HistoricalOhlcvDatasetValidationIssue[];

  constructor(issues: readonly HistoricalOhlcvDatasetValidationIssue[]) {
    super(
      issues.length
        ? `OHLCV dataset validation failed: ${issues[0].code}`
        : "OHLCV dataset validation failed"
    );
    this.name = "HistoricalOhlcvDatasetValidationError";
    this.issues = issues;
  }
}

function finiteField(value: number, field: string, index: number): HistoricalOhlcvDatasetValidationIssue | null {
  if (!Number.isFinite(value)) {
    return {
      code: "NON_FINITE_FIELD",
      message: `${field} is not finite`,
      candleIndex: index,
    };
  }
  return null;
}

function validateCandleRow(
  candle: Candle,
  index: number,
  requirePositiveVolume: boolean
): HistoricalOhlcvDatasetValidationIssue[] {
  const issues: HistoricalOhlcvDatasetValidationIssue[] = [];
  for (const [field, value] of [
    ["time", candle.time],
    ["open", candle.open],
    ["high", candle.high],
    ["low", candle.low],
    ["close", candle.close],
    ["volume", candle.volume],
  ] as const) {
    const issue = finiteField(value, field, index);
    if (issue) {
      issues.push(issue);
    }
  }
  if (issues.length) {
    return issues;
  }
  if (requirePositiveVolume && candle.volume <= 0) {
    issues.push({
      code: "NEGATIVE_VOLUME",
      message: "volume must be positive",
      candleIndex: index,
    });
  }
  const maxBody = Math.max(candle.open, candle.close);
  const minBody = Math.min(candle.open, candle.close);
  if (candle.high < maxBody) {
    issues.push({
      code: "INVALID_OHLC_RELATION",
      message: "high < max(open, close)",
      candleIndex: index,
    });
  }
  if (candle.low > minBody) {
    issues.push({
      code: "INVALID_OHLC_RELATION",
      message: "low > min(open, close)",
      candleIndex: index,
    });
  }
  if (candle.high < candle.low) {
    issues.push({
      code: "INVALID_OHLC_RELATION",
      message: "high < low",
      candleIndex: index,
    });
  }
  return issues;
}

/**
 * B-11: strict OHLCV validation for real historical backtests. Does not mutate candles.
 */
export function validateHistoricalOhlcvDataset(
  input: HistoricalOhlcvDatasetValidationInput
): HistoricalOhlcvDatasetValidationResult {
  const candles = input.candles;
  const requirePositiveVolume = input.requirePositiveVolume ?? false;
  const issues: HistoricalOhlcvDatasetValidationIssue[] = [];

  if (!candles.length) {
    issues.push({
      code: "EMPTY_DATASET",
      message: "dataset is empty",
      candleIndex: null,
    });
    return {
      schemaVersion: HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION,
      candleCount: 0,
      firstTime: null,
      lastTime: null,
      ok: false,
      issues,
    };
  }

  const seen = new Set<number>();
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i > 0 && c.time < candles[i - 1].time) {
      issues.push({
        code: "NON_CHRONOLOGICAL_ORDER",
        message: "candle time regressed",
        candleIndex: i,
      });
    }
    if (seen.has(c.time)) {
      issues.push({
        code: "DUPLICATE_TIMESTAMP",
        message: `duplicate time ${c.time}`,
        candleIndex: i,
      });
    }
    seen.add(c.time);
    issues.push(...validateCandleRow(c, i, requirePositiveVolume));
  }

  const expected = input.expectedBarDurationMs;
  if (expected !== undefined && Number.isFinite(expected) && expected > 0) {
    for (let i = 1; i < candles.length; i++) {
      const delta = candles[i].time - candles[i - 1].time;
      if (delta !== expected) {
        issues.push({
          code: delta % expected === 0 && delta > expected ? "TIMEFRAME_GAP" : "TIMEFRAME_MISMATCH",
          message: `bar delta ${delta}ms expected ${expected}ms`,
          candleIndex: i,
        });
      }
    }
  }

  return {
    schemaVersion: HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION,
    candleCount: candles.length,
    firstTime: candles[0].time,
    lastTime: candles[candles.length - 1].time,
    ok: issues.length === 0,
    issues,
  };
}

export function assertHistoricalOhlcvDatasetValid(
  input: HistoricalOhlcvDatasetValidationInput
): HistoricalOhlcvDatasetValidationResult {
  const result = validateHistoricalOhlcvDataset(input);
  if (!result.ok) {
    throw new HistoricalOhlcvDatasetValidationError(result.issues);
  }
  return result;
}
