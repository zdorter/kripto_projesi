import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../src/wave/historical-ohlcv-dataset-loader";
import {
  freezeHistoricalOhlcvDataset,
  InsufficientFrozenDatasetError,
} from "../src/wave/historical-frozen-ohlcv-dataset-freeze";
import {
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
  type MultiSymbol1hResearchFrozenSymbol,
} from "../src/wave/historical-frozen-ohlcv-dataset-types";

export async function fetchAndFreezeResearchOhlcvDatasetV1(
  symbol: MultiSymbol1hResearchFrozenSymbol,
  timeframe: string = "1H"
) {
  const relativePath = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
  const targetCount = REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES;

  const candles = await fetchBinanceFuturesHistoricalCandles(symbol, timeframe, targetCount);
  const doc = freezeHistoricalOhlcvDataset({
    candles,
    symbol,
    timeframe,
    relativePath,
    expectedCandleCount: RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
    closedCandleOnly: true,
  });
  return doc;
}

export { InsufficientFrozenDatasetError };
