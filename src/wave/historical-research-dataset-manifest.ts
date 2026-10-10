import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH,
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  type HistoricalResearchDatasetManifestDocument,
  type HistoricalResearchDatasetManifestEntry,
  type MultiSymbol1hResearchFrozenSymbol,
} from "./historical-frozen-ohlcv-dataset-types";
import { HistoricalFrozenOhlcvDatasetError, loadHistoricalFrozenOhlcvDatasetFromFile } from "./historical-frozen-ohlcv-dataset";
import type { PhaseBResearchDatasetRef } from "./historical-phase-b-multi-symbol-regime-validation-types";

export function buildHistoricalResearchDatasetManifestEntryFromFile(
  symbol: MultiSymbol1hResearchFrozenSymbol,
  timeframe: string,
  cwd: string = process.cwd()
): HistoricalResearchDatasetManifestEntry {
  const path = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
  const abs = join(cwd, path);
  if (!existsSync(abs)) {
    return {
      symbol,
      timeframe,
      path,
      checksum: null,
      candleCount: null,
      firstTimestamp: null,
      lastTimestamp: null,
      status: "DATASET_NOT_AVAILABLE",
    };
  }
  const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(path, cwd);
  const m = loaded.document.metadata;
  return {
    symbol: m.symbol,
    timeframe: m.timeframe,
    path,
    checksum: m.datasetChecksum,
    candleCount: m.candleCount,
    firstTimestamp: m.firstTimestamp,
    lastTimestamp: m.lastTimestamp,
    status: "DATASET_AVAILABLE",
  };
}

export function buildHistoricalResearchDatasetManifestDocument(
  cwd: string = process.cwd()
): HistoricalResearchDatasetManifestDocument {
  const entries = MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS.map((symbol) =>
    buildHistoricalResearchDatasetManifestEntryFromFile(symbol, "1H", cwd)
  );
  return {
    schemaVersion: "1.0",
    generatedNote:
      "B-22 research manifest; BTC checksum must match BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM when fixture present.",
    entries,
  };
}

export function writeHistoricalResearchDatasetManifestV1(cwd: string = process.cwd()): HistoricalResearchDatasetManifestDocument {
  const doc = buildHistoricalResearchDatasetManifestDocument(cwd);
  const filePath = join(cwd, HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return doc;
}

export function loadHistoricalResearchDatasetManifestV1(
  cwd: string = process.cwd()
): HistoricalResearchDatasetManifestDocument {
  const filePath = join(cwd, HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH);
  if (!existsSync(filePath)) {
    return buildHistoricalResearchDatasetManifestDocument(cwd);
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as HistoricalResearchDatasetManifestDocument;
  return parsed;
}

export function assertBtcResearchDatasetChecksumUnchanged(cwd: string = process.cwd()): void {
  const btc = buildHistoricalResearchDatasetManifestEntryFromFile("BTCUSDT", "1H", cwd);
  if (btc.status !== "DATASET_AVAILABLE" || !btc.checksum) {
    throw new HistoricalFrozenOhlcvDatasetError("BTC research fixture missing for checksum guard");
  }
  if (btc.checksum !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new HistoricalFrozenOhlcvDatasetError(
      `BTC fixture checksum changed: expected ${BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM}, got ${btc.checksum}`
    );
  }
}

export function loadMultiSymbol1hResearchFrozenDatasetV1(
  symbol: MultiSymbol1hResearchFrozenSymbol,
  cwd: string = process.cwd()
) {
  const path = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
  return loadHistoricalFrozenOhlcvDatasetFromFile(path, cwd);
}

export function toPhaseBResearchDatasetRefFromLoaded(
  loaded: ReturnType<typeof loadHistoricalFrozenOhlcvDatasetFromFile>,
  fixturePath: string
): PhaseBResearchDatasetRef {
  const m = loaded.document.metadata;
  return {
    symbol: m.symbol,
    timeframe: m.timeframe,
    fixturePath,
    datasetChecksum: m.datasetChecksum,
    candleCount: m.candleCount,
    firstTimestamp: m.firstTimestamp,
    lastTimestamp: m.lastTimestamp,
    status: "AVAILABLE",
    candles: loaded.candles,
  };
}

export function buildPhaseBResearchDatasetRefsFromManifest(
  cwd: string = process.cwd()
): PhaseBResearchDatasetRef[] {
  const manifest = loadHistoricalResearchDatasetManifestV1(cwd);
  const refs: PhaseBResearchDatasetRef[] = [];
  for (const entry of manifest.entries) {
    if (entry.status !== "DATASET_AVAILABLE" || !entry.checksum) continue;
    const symbol = entry.symbol as MultiSymbol1hResearchFrozenSymbol;
    if (!(symbol in RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL)) continue;
    const loaded = loadMultiSymbol1hResearchFrozenDatasetV1(symbol, cwd);
    refs.push(toPhaseBResearchDatasetRefFromLoaded(loaded, entry.path));
  }
  return refs.sort((a, b) => `${a.symbol}:${a.timeframe}`.localeCompare(`${b.symbol}:${b.timeframe}`));
}
