import type { Candle } from "./types";

export const HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION = "1.0" as const;

export type HistoricalOhlcvDatasetValidationErrorCode =
  | "EMPTY_DATASET"
  | "NON_CHRONOLOGICAL_ORDER"
  | "DUPLICATE_TIMESTAMP"
  | "NON_FINITE_FIELD"
  | "INVALID_OHLC_RELATION"
  | "NEGATIVE_VOLUME"
  | "TIMEFRAME_GAP"
  | "TIMEFRAME_MISMATCH";

export interface HistoricalOhlcvDatasetValidationIssue {
  code: HistoricalOhlcvDatasetValidationErrorCode;
  message: string;
  candleIndex: number | null;
}

export interface HistoricalOhlcvDatasetValidationInput {
  candles: readonly Candle[];
  /** When set, consecutive open times must differ by exactly this many ms. */
  expectedBarDurationMs?: number;
  /** When true, volume must be > 0 (stricter exchange-style check). */
  requirePositiveVolume?: boolean;
}

export interface HistoricalOhlcvDatasetValidationResult {
  schemaVersion: typeof HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION;
  candleCount: number;
  firstTime: number | null;
  lastTime: number | null;
  ok: boolean;
  issues: HistoricalOhlcvDatasetValidationIssue[];
}
