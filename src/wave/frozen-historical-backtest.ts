import {
  loadBtcusdt1hResearchFrozenDatasetV1,
  loadHistoricalFrozenOhlcvDatasetFromFile,
} from "./historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH } from "./historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "./historical-frozen-ohlcv-dataset-hash";
import { runRealHistoricalBacktest } from "./real-historical-backtest";
import type { RealHistoricalBacktestResult } from "./real-historical-backtest-types";
import type { RunRealHistoricalBacktestInput } from "./real-historical-backtest-types";
import type { Candle, WaveEngineOptions } from "./types";

export const FROZEN_HISTORICAL_BACKTEST_SCHEMA_VERSION = "1.0" as const;

export interface RunFrozenHistoricalBacktestInput {
  symbol?: string;
  timeframeId?: string;
  /** When omitted, loads the version-controlled BTCUSDT 1H research fixture (no network). */
  candles?: readonly Candle[];
  horizonBars?: number;
  startEvaluationBar?: number;
  endEvaluationBar?: number;
  engineOptions?: WaveEngineOptions;
  /** Override fixture path (relative to cwd); still read-only, no network. */
  frozenDatasetRelativePath?: string;
}

export interface FrozenHistoricalBacktestResult extends RealHistoricalBacktestResult {
  frozenLayer: {
    schemaVersion: typeof FROZEN_HISTORICAL_BACKTEST_SCHEMA_VERSION;
    datasetChecksum: string;
    fixtureRelativePath: string | null;
  };
}

function resolveFrozenCandles(
  input: RunFrozenHistoricalBacktestInput
): { candles: readonly Candle[]; fixtureRelativePath: string | null } {
  if (input.candles !== undefined) {
    return { candles: input.candles, fixtureRelativePath: null };
  }
  if (input.frozenDatasetRelativePath) {
    const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(
      input.frozenDatasetRelativePath
    );
    return {
      candles: loaded.candles,
      fixtureRelativePath: input.frozenDatasetRelativePath,
    };
  }
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  return {
    candles: loaded.candles,
    fixtureRelativePath: BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  };
}

/**
 * B-12q: same stack as runRealHistoricalBacktest; candles from fixture or caller (no Binance).
 */
export function runFrozenHistoricalBacktest(
  input: RunFrozenHistoricalBacktestInput = {}
): FrozenHistoricalBacktestResult {
  const { candles, fixtureRelativePath } = resolveFrozenCandles(input);
  const symbol = input.symbol ?? "BTCUSDT";
  const timeframeId = input.timeframeId ?? "1H";

  const backtestInput: RunRealHistoricalBacktestInput = {
    symbol,
    timeframeId,
    candles,
    horizonBars: input.horizonBars,
    startEvaluationBar: input.startEvaluationBar,
    endEvaluationBar: input.endEvaluationBar,
    engineOptions: input.engineOptions,
  };

  const result = runRealHistoricalBacktest(backtestInput);
  const datasetChecksum = computeHistoricalFrozenOhlcvDatasetChecksum(candles);

  return {
    ...result,
    frozenLayer: {
      schemaVersion: FROZEN_HISTORICAL_BACKTEST_SCHEMA_VERSION,
      datasetChecksum,
      fixtureRelativePath,
    },
  };
}
