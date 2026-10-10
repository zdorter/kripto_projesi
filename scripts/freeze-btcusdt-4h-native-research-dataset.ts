import { fetchBinanceFuturesHistoricalCandles } from "../src/wave/historical-ohlcv-dataset-loader";
import { assertHistoricalOhlcvDatasetValid } from "../src/wave/historical-ohlcv-dataset-validation";
import { expectedBarDurationMsForWaveTimeframe } from "../src/wave/historical-ohlcv-dataset-loader";
import { freezeHistoricalOhlcvDataset } from "../src/wave/historical-frozen-ohlcv-dataset-freeze";
import {
  loadBtcusdt1hResearchFrozenDatasetV1,
} from "../src/wave/historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
} from "../src/wave/historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../src/wave/historical-frozen-ohlcv-dataset-hash";
import { utc4hBucketOpen } from "../src/wave/market-structure/native-htf-parity";

const FOUR_H_MS = 14_400_000;

async function main(): Promise<void> {
  const loaded1h = loadBtcusdt1hResearchFrozenDatasetV1();
  const checksum1h = computeHistoricalFrozenOhlcvDatasetChecksum(loaded1h.candles);
  if (checksum1h !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new Error(
      `STOP: BTC 1H checksum mismatch (expected frozen baseline). got=${checksum1h}`
    );
  }

  const first1h = loaded1h.candles[0].time;
  const last1h = loaded1h.candles[loaded1h.candles.length - 1].time;
  const bucketStart = utc4hBucketOpen(first1h);
  const bucketEnd = utc4hBucketOpen(last1h);
  const expectedCount = (bucketEnd - bucketStart) / FOUR_H_MS + 1;

  const fetchTarget = Math.min(10_000, expectedCount + 20);
  const fetched = await fetchBinanceFuturesHistoricalCandles(
    "BTCUSDT",
    "4H",
    fetchTarget
  );

  const candles = fetched.filter((c) => c.time >= bucketStart && c.time <= bucketEnd);
  if (candles.length !== expectedCount) {
    throw new Error(
      `Native 4H intersect range mismatch: expected ${expectedCount} rows, got ${candles.length} ` +
        `(bucketStart=${bucketStart} bucketEnd=${bucketEnd})`
    );
  }

  const barMs = expectedBarDurationMsForWaveTimeframe("4H") ?? FOUR_H_MS;
  assertHistoricalOhlcvDatasetValid({
    candles,
    expectedBarDurationMs: barMs,
  });

  for (const c of candles) {
    if (c.time !== utc4hBucketOpen(c.time)) {
      throw new Error(`UTC 4H alignment failed at ${c.time}`);
    }
  }

  const doc = freezeHistoricalOhlcvDataset({
    candles,
    symbol: "BTCUSDT",
    timeframe: "4H",
    relativePath: BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
    expectedCandleCount: expectedCount,
    closedCandleOnly: true,
  });

  console.log("Frozen native 4H written:", BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
  console.log("candleCount:", doc.metadata.candleCount);
  console.log("firstTimestamp:", doc.metadata.firstTimestamp, new Date(doc.metadata.firstTimestamp).toISOString());
  console.log("lastTimestamp:", doc.metadata.lastTimestamp, new Date(doc.metadata.lastTimestamp).toISOString());
  console.log("datasetChecksum (4H native — not 1H):", doc.metadata.datasetChecksum);
  console.log("1H intersect bucketStart:", bucketStart, "bucketEnd:", bucketEnd);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
