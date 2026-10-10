import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertHistoricalOhlcvDatasetValid,
  validateHistoricalOhlcvDataset,
} from "./historical-ohlcv-dataset-validation";
import { expectedBarDurationMsForWaveTimeframe } from "./historical-ohlcv-dataset-loader";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION,
  type HistoricalFrozenLiveDatasetDriftReport,
  type HistoricalFrozenOhlcvDatasetDocument,
  type HistoricalFrozenOhlcvDatasetMetadata,
  type LoadedHistoricalFrozenOhlcvDataset,
} from "./historical-frozen-ohlcv-dataset-types";
import {
  candlesFromFrozenOhlcvRecords,
  computeHistoricalFrozenOhlcvDatasetChecksum,
  frozenOhlcvRecordsFromCandles,
} from "./historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "./types";

const FROZEN_DATASET_SOURCE = "binance-futures-klines" as const;

export class HistoricalFrozenOhlcvDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalFrozenOhlcvDatasetError";
  }
}

export function buildHistoricalFrozenOhlcvDatasetMetadata(
  candles: readonly Candle[],
  options: {
    symbol: string;
    timeframe: string;
    source?: string;
    closedCandleOnly?: boolean;
  }
): HistoricalFrozenOhlcvDatasetMetadata {
  if (!candles.length) {
    throw new HistoricalFrozenOhlcvDatasetError("cannot build metadata for empty candles");
  }
  const barDurationMs =
    expectedBarDurationMsForWaveTimeframe(options.timeframe) ?? 3_600_000;
  const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(candles);
  return {
    schemaVersion: HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION,
    symbol: options.symbol,
    timeframe: options.timeframe,
    candleCount: candles.length,
    firstTimestamp: candles[0].time,
    lastTimestamp: candles[candles.length - 1].time,
    source: options.source ?? FROZEN_DATASET_SOURCE,
    closedCandleOnly: options.closedCandleOnly ?? true,
    barDurationMs,
    datasetChecksum: checksum,
  };
}

export function buildHistoricalFrozenOhlcvDatasetDocument(
  candles: readonly Candle[],
  options: {
    symbol: string;
    timeframe: string;
    source?: string;
    closedCandleOnly?: boolean;
  }
): HistoricalFrozenOhlcvDatasetDocument {
  const metadata = buildHistoricalFrozenOhlcvDatasetMetadata(candles, options);
  return {
    schemaVersion: HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION,
    metadata,
    candles: frozenOhlcvRecordsFromCandles(candles),
  };
}

function assertDocumentShape(doc: HistoricalFrozenOhlcvDatasetDocument): void {
  if (doc.schemaVersion !== HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION) {
    throw new HistoricalFrozenOhlcvDatasetError(
      `unsupported schemaVersion ${doc.schemaVersion}`
    );
  }
  if (!doc.metadata || !Array.isArray(doc.candles)) {
    throw new HistoricalFrozenOhlcvDatasetError("invalid frozen dataset document shape");
  }
  if (doc.metadata.candleCount !== doc.candles.length) {
    throw new HistoricalFrozenOhlcvDatasetError(
      "metadata.candleCount does not match candles.length"
    );
  }
}

function assertMetadataMatchesCandles(
  metadata: HistoricalFrozenOhlcvDatasetMetadata,
  candles: readonly Candle[]
): void {
  if (metadata.candleCount !== candles.length) {
    throw new HistoricalFrozenOhlcvDatasetError("metadata candleCount mismatch");
  }
  if (metadata.firstTimestamp !== candles[0].time) {
    throw new HistoricalFrozenOhlcvDatasetError("metadata firstTimestamp mismatch");
  }
  if (metadata.lastTimestamp !== candles[candles.length - 1].time) {
    throw new HistoricalFrozenOhlcvDatasetError("metadata lastTimestamp mismatch");
  }
  const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(candles);
  if (metadata.datasetChecksum !== checksum) {
    throw new HistoricalFrozenOhlcvDatasetError("datasetChecksum mismatch");
  }
}

export function parseHistoricalFrozenOhlcvDatasetJson(
  jsonText: string
): LoadedHistoricalFrozenOhlcvDataset {
  const parsed = JSON.parse(jsonText) as HistoricalFrozenOhlcvDatasetDocument;
  assertDocumentShape(parsed);
  const candles = candlesFromFrozenOhlcvRecords(parsed.candles);
  assertMetadataMatchesCandles(parsed.metadata, candles);
  return { document: parsed, candles };
}

export function loadHistoricalFrozenOhlcvDatasetFromFile(
  absoluteOrRelativePath: string,
  cwd: string = process.cwd()
): LoadedHistoricalFrozenOhlcvDataset {
  const filePath = join(cwd, absoluteOrRelativePath);
  const jsonText = readFileSync(filePath, "utf8");
  const loaded = parseHistoricalFrozenOhlcvDatasetJson(jsonText);
  const barMs = loaded.document.metadata.barDurationMs;
  assertHistoricalOhlcvDatasetValid({
    candles: loaded.candles,
    expectedBarDurationMs: barMs,
  });
  return loaded;
}

export function loadBtcusdt1hResearchFrozenDatasetV1(
  cwd: string = process.cwd()
): LoadedHistoricalFrozenOhlcvDataset {
  const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(
    BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
    cwd
  );
  if (loaded.candles.length !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT) {
    throw new HistoricalFrozenOhlcvDatasetError(
      `expected ${BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT} candles, got ${loaded.candles.length}`
    );
  }
  return loaded;
}

export function loadBtcusdt4hNativeResearchFrozenDatasetV1(
  cwd: string = process.cwd()
): LoadedHistoricalFrozenOhlcvDataset {
  const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(
    BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
    cwd
  );
  if (loaded.candles.length !== BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT) {
    throw new HistoricalFrozenOhlcvDatasetError(
      `expected ${BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT} native 4H candles, got ${loaded.candles.length}`
    );
  }
  const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
  if (checksum !== BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new HistoricalFrozenOhlcvDatasetError(
      `native 4H checksum mismatch: expected ${BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM}, got ${checksum}`
    );
  }
  return loaded;
}

export function validateLoadedFrozenOhlcvDataset(
  loaded: LoadedHistoricalFrozenOhlcvDataset
): ReturnType<typeof validateHistoricalOhlcvDataset> {
  return validateHistoricalOhlcvDataset({
    candles: loaded.candles,
    expectedBarDurationMs: loaded.document.metadata.barDurationMs,
  });
}

function candlesEqual(a: Candle, b: Candle): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

/** Read-only comparison; does not mutate either series. */
export function compareHistoricalFrozenVsLiveOhlcvDatasets(
  live: readonly Candle[],
  frozen: readonly Candle[]
): HistoricalFrozenLiveDatasetDriftReport {
  const liveFirst = live.length ? live[0].time : null;
  const liveLast = live.length ? live[live.length - 1].time : null;
  const frozenFirst = frozen.length ? frozen[0].time : 0;
  const frozenLast = frozen.length ? frozen[frozen.length - 1].time : 0;

  let differingCandleCount = 0;
  let firstDifferingIndex: number | null = null;
  const n = Math.min(live.length, frozen.length);
  for (let i = 0; i < n; i++) {
    if (!candlesEqual(live[i], frozen[i])) {
      differingCandleCount += 1;
      if (firstDifferingIndex === null) {
        firstDifferingIndex = i;
      }
    }
  }
  if (live.length !== frozen.length) {
    differingCandleCount += Math.abs(live.length - frozen.length);
  }

  return {
    live: {
      candleCount: live.length,
      firstTimestamp: liveFirst,
      lastTimestamp: liveLast,
    },
    frozen: {
      candleCount: frozen.length,
      firstTimestamp: frozenFirst,
      lastTimestamp: frozenLast,
    },
    sameCount: live.length === frozen.length,
    sameFirstTimestamp: liveFirst === frozenFirst,
    sameLastTimestamp: liveLast === frozenLast,
    differingCandleCount,
    firstDifferingIndex,
  };
}

export function formatHistoricalFrozenLiveDatasetDriftReport(
  report: HistoricalFrozenLiveDatasetDriftReport
): string {
  const lines = [
    "LIVE_DATASET:",
    `  ${report.live.candleCount} candles`,
    `  first = ${report.live.firstTimestamp}`,
    `  last = ${report.live.lastTimestamp}`,
    "FROZEN_DATASET:",
    `  ${report.frozen.candleCount} candles`,
    `  first = ${report.frozen.firstTimestamp}`,
    `  last = ${report.frozen.lastTimestamp}`,
    `differingCandleCount = ${report.differingCandleCount}`,
    `firstDifferingIndex = ${report.firstDifferingIndex}`,
  ];
  return lines.join("\n");
}
