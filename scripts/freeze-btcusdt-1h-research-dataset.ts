import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../src/wave/historical-ohlcv-dataset-loader";
import { assertHistoricalOhlcvDatasetValid } from "../src/wave/historical-ohlcv-dataset-validation";
import { expectedBarDurationMsForWaveTimeframe } from "../src/wave/historical-ohlcv-dataset-loader";
import { freezeHistoricalOhlcvDataset } from "../src/wave/historical-frozen-ohlcv-dataset-freeze";
import {
  BTCUSDT_1H_RESEARCH_B11_REFERENCE_FIRST_ISO,
  BTCUSDT_1H_RESEARCH_B11_REFERENCE_LAST_ISO,
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
} from "../src/wave/historical-frozen-ohlcv-dataset-types";

async function main(): Promise<void> {
  const symbol = "BTCUSDT";
  const timeframe = "1H";
  const targetCount = REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES;

  const candles = await fetchBinanceFuturesHistoricalCandles(
    symbol,
    timeframe,
    targetCount
  );

  const barMs = expectedBarDurationMsForWaveTimeframe(timeframe) ?? 3_600_000;
  const validation = assertHistoricalOhlcvDatasetValid({
    candles,
    expectedBarDurationMs: barMs,
  });

  const doc = freezeHistoricalOhlcvDataset({
    candles,
    symbol,
    timeframe,
    relativePath: BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
    expectedCandleCount: RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
    closedCandleOnly: true,
  });

  console.log("Frozen dataset written:", BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
  console.log("candleCount:", doc.metadata.candleCount);
  console.log("firstTimestamp:", doc.metadata.firstTimestamp, new Date(doc.metadata.firstTimestamp).toISOString());
  console.log("lastTimestamp:", doc.metadata.lastTimestamp, new Date(doc.metadata.lastTimestamp).toISOString());
  console.log("datasetChecksum:", doc.metadata.datasetChecksum);
  console.log("B-11 reference range:", BTCUSDT_1H_RESEARCH_B11_REFERENCE_FIRST_ISO, "→", BTCUSDT_1H_RESEARCH_B11_REFERENCE_LAST_ISO);
  console.log("loader validation first/last:", validation.firstTime, validation.lastTime);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
