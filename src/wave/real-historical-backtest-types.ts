import type { HistoricalBacktestReport } from "./historical-backtest-types";
import type { HistoricalOhlcvDatasetValidationResult } from "./historical-ohlcv-dataset-validation-types";
import type { Candle, WaveEngineOptions } from "./types";

export const REAL_HISTORICAL_BACKTEST_SCHEMA_VERSION = "1.0" as const;

export interface RealHistoricalBacktestEvaluationRange {
  startEvaluationBar: number;
  endEvaluationBar: number;
  horizonBars: number;
  /** Documented rationale for start bar (B-8c allows 0; warm-up is empirical). */
  startEvaluationBarRationale: string;
}

export interface RealHistoricalBacktestDatasetMeta {
  symbol: string;
  timeframeId: string;
  candleCount: number;
  firstTime: number;
  lastTime: number;
  validation: HistoricalOhlcvDatasetValidationResult;
}

export interface RunRealHistoricalBacktestInput {
  symbol: string;
  timeframeId: string;
  candles: readonly Candle[];
  horizonBars?: number;
  startEvaluationBar?: number;
  endEvaluationBar?: number;
  engineOptions?: WaveEngineOptions;
}

export interface RealHistoricalBacktestPathOutcomeCounts {
  TARGET_TOUCHED: number;
  INVALIDATION_TOUCHED: number;
  AMBIGUOUS: number;
  NO_TOUCH: number;
  NO_FUTURE_DATA: number;
  INSUFFICIENT_CONTEXT: number;
}

export interface RealHistoricalBacktestResult {
  schemaVersion: typeof REAL_HISTORICAL_BACKTEST_SCHEMA_VERSION;
  dataset: RealHistoricalBacktestDatasetMeta;
  evaluationRange: RealHistoricalBacktestEvaluationRange;
  report: HistoricalBacktestReport;
  pathOutcomeCounts: RealHistoricalBacktestPathOutcomeCounts;
}
