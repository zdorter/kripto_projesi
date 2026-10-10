import {
  assertBtcResearchDatasetChecksumUnchanged,
  writeHistoricalResearchDatasetManifestV1,
} from "../src/wave/historical-research-dataset-manifest";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../src/wave/historical-frozen-ohlcv-dataset-hash";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../src/wave/historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../src/wave/historical-frozen-ohlcv-dataset-types";
import { fetchAndFreezeResearchOhlcvDatasetV1 } from "./freeze-research-ohlcv-shared";

const ALT_SYMBOLS = ["ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"] as const;

async function main(): Promise<void> {
  const btcBefore = loadBtcusdt1hResearchFrozenDatasetV1();
  const checksumBefore = computeHistoricalFrozenOhlcvDatasetChecksum(btcBefore.candles);
  if (checksumBefore !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new Error(`BTC checksum guard failed before freeze: ${checksumBefore}`);
  }
  console.log("BTC checksum before:", checksumBefore);

  for (const symbol of ALT_SYMBOLS) {
    console.log(`Freezing ${symbol} 1H...`);
    const doc = await fetchAndFreezeResearchOhlcvDatasetV1(symbol, "1H");
    console.log(
      `  wrote ${doc.metadata.candleCount} candles; checksum=${doc.metadata.datasetChecksum}; last=${new Date(doc.metadata.lastTimestamp).toISOString()}`
    );
  }

  assertBtcResearchDatasetChecksumUnchanged();
  const btcAfter = loadBtcusdt1hResearchFrozenDatasetV1();
  const checksumAfter = computeHistoricalFrozenOhlcvDatasetChecksum(btcAfter.candles);
  if (checksumAfter !== checksumBefore) {
    throw new Error("BTC fixture mutated during multisymbol freeze");
  }
  console.log("BTC checksum after:", checksumAfter);

  const manifest = writeHistoricalResearchDatasetManifestV1();
  console.log("Manifest written with entries:", manifest.entries.map((e) => `${e.symbol}:${e.status}`).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
