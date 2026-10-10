import type { Candle } from "./types";

export const HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION = "1.0" as const;

export const BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json" as const;

export const BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT = 3000 as const;

export const BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc" as const;

/** Native Binance 4H research fixture (parity layer; separate checksum from 1H). */
export const BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/btcusdt-4h-native-research-ohlcv-v1.json" as const;

/** Populated by freeze:btcusdt-4h-native-research script; do not conflate with 1H checksum. */
export const BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT = 751 as const;

export const BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM =
  "b63631389780c675c51520e863a9fac67afb4a0040a784037e075d26434d079e" as const;

export const RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT =
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT;

export const ETHUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/ethusdt-1h-research-ohlcv-v1.json" as const;
export const BNBUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/bnbusdt-1h-research-ohlcv-v1.json" as const;
export const SOLUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/solusdt-1h-research-ohlcv-v1.json" as const;
export const XRPUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/xrpusdt-1h-research-ohlcv-v1.json" as const;
export const ADAUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH =
  "src/wave/fixtures/adausdt-1h-research-ohlcv-v1.json" as const;

export const HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH =
  "src/wave/fixtures/historical-research-dataset-manifest-v1.json" as const;

export const MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

export type MultiSymbol1hResearchFrozenSymbol =
  (typeof MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS)[number];

export const RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL: Readonly<
  Record<MultiSymbol1hResearchFrozenSymbol, string>
> = {
  BTCUSDT: BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  ETHUSDT: ETHUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BNBUSDT: BNBUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  SOLUSDT: SOLUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  XRPUSDT: XRPUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  ADAUSDT: ADAUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
};

export type ResearchDatasetManifestStatus = "DATASET_AVAILABLE" | "DATASET_NOT_AVAILABLE";

export interface HistoricalResearchDatasetManifestEntry {
  symbol: string;
  timeframe: string;
  path: string;
  checksum: string | null;
  candleCount: number | null;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  status: ResearchDatasetManifestStatus;
}

export interface HistoricalResearchDatasetManifestDocument {
  schemaVersion: "1.0";
  generatedNote: string;
  entries: readonly HistoricalResearchDatasetManifestEntry[];
}

/** B-11 documented reference range (may differ from loader closed-candle window). */
export const BTCUSDT_1H_RESEARCH_B11_REFERENCE_FIRST_ISO =
  "2026-06-02T10:00:00.000Z" as const;
export const BTCUSDT_1H_RESEARCH_B11_REFERENCE_LAST_ISO =
  "2026-10-05T09:00:00.000Z" as const;

export interface HistoricalFrozenOhlcvCandleRecord {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalFrozenOhlcvDatasetMetadata {
  schemaVersion: typeof HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION;
  symbol: string;
  timeframe: string;
  candleCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  source: string;
  closedCandleOnly: boolean;
  barDurationMs: number;
  datasetChecksum: string;
}

export interface HistoricalFrozenOhlcvDatasetDocument {
  schemaVersion: typeof HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION;
  metadata: HistoricalFrozenOhlcvDatasetMetadata;
  candles: readonly HistoricalFrozenOhlcvCandleRecord[];
}

export interface LoadedHistoricalFrozenOhlcvDataset {
  document: HistoricalFrozenOhlcvDatasetDocument;
  candles: readonly Candle[];
}

export interface HistoricalFrozenLiveDatasetDriftReport {
  live: {
    candleCount: number;
    firstTimestamp: number | null;
    lastTimestamp: number | null;
  };
  frozen: {
    candleCount: number;
    firstTimestamp: number;
    lastTimestamp: number;
  };
  sameCount: boolean;
  sameFirstTimestamp: boolean;
  sameLastTimestamp: boolean;
  differingCandleCount: number;
  firstDifferingIndex: number | null;
}
