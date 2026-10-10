import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  type MultiSymbol1hResearchFrozenSymbol,
} from "../historical-frozen-ohlcv-dataset-types";
import {
  HistoricalFrozenOhlcvDatasetError,
  loadHistoricalFrozenOhlcvDatasetFromFile,
} from "../historical-frozen-ohlcv-dataset";
import { buildHistoricalResearchDatasetManifestEntryFromFile } from "../historical-research-dataset-manifest";
import type { HistoricalResearchDataset } from "./msl-historical-research-pipeline-types";

const MIN_WARMUP_BARS = 20;

export function researchDatasetId(symbol: string, timeframe: string): string {
  return `${symbol}_${timeframe.replace(/\s/g, "")}_RESEARCH_FROZEN_V1`;
}

export function loadHistoricalResearchDatasetFromSymbol(
  symbol: MultiSymbol1hResearchFrozenSymbol,
  cwd: string = process.cwd()
): HistoricalResearchDataset | null {
  const path = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
  if (!existsSync(join(cwd, path))) {
    return null;
  }
  try {
    const loaded = loadHistoricalFrozenOhlcvDatasetFromFile(path, cwd);
    const m = loaded.document.metadata;
    const last = loaded.candles.length - 1;
    return {
      datasetId: researchDatasetId(m.symbol, m.timeframe),
      symbol: m.symbol,
      timeframe: m.timeframe,
      datasetChecksum: m.datasetChecksum,
      source: m.source,
      closedCandleOnly: m.closedCandleOnly,
      barDurationMs: m.barDurationMs,
      fixturePath: path,
      candles: loaded.candles,
      status: "COMPLETE",
      firstEvaluationBar: MIN_WARMUP_BARS,
      lastEvaluationBar: last,
    };
  } catch {
    return {
      datasetId: researchDatasetId(symbol, "1H"),
      symbol,
      timeframe: "1H",
      datasetChecksum: "",
      source: "binance-futures-klines",
      closedCandleOnly: true,
      barDurationMs: 3_600_000,
      fixturePath: path,
      candles: [],
      status: "INVALID",
      firstEvaluationBar: 0,
      lastEvaluationBar: 0,
    };
  }
}

export function resolveAvailableHistoricalResearchDatasets(input: {
  symbols?: readonly string[];
  cwd?: string;
}): {
  datasets: HistoricalResearchDataset[];
  unresolved: { code: string; message: string }[];
} {
  const cwd = input.cwd ?? process.cwd();
  const requested =
    input.symbols?.length ?
      input.symbols
    : [...MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS];
  const datasets: HistoricalResearchDataset[] = [];
  const unresolved: { code: string; message: string }[] = [];
  const checksumById = new Map<string, string>();

  for (const sym of requested) {
    if (
      !MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS.includes(
        sym as MultiSymbol1hResearchFrozenSymbol
      )
    ) {
      unresolved.push({
        code: "UNSUPPORTED_SYMBOL",
        message: `Symbol ${sym} is not in frozen 1H research manifest.`,
      });
      continue;
    }
    const entry = buildHistoricalResearchDatasetManifestEntryFromFile(
      sym as MultiSymbol1hResearchFrozenSymbol,
      "1H",
      cwd
    );
    if (entry.status !== "DATASET_AVAILABLE" || !entry.checksum) {
      unresolved.push({
        code: "DATASET_NOT_AVAILABLE",
        message: `Frozen dataset missing for ${sym} at ${entry.path}.`,
      });
      continue;
    }
    const ds = loadHistoricalResearchDatasetFromSymbol(
      sym as MultiSymbol1hResearchFrozenSymbol,
      cwd
    );
    if (!ds || ds.status !== "COMPLETE") {
      unresolved.push({
        code: "DATASET_INVALID",
        message: `Failed to load frozen dataset for ${sym}.`,
      });
      continue;
    }
    const prior = checksumById.get(ds.datasetId);
    if (prior && prior !== ds.datasetChecksum) {
      throw new HistoricalFrozenOhlcvDatasetError(
        `DATASET_CHECKSUM_CONFLICT for ${ds.datasetId}: ${prior} vs ${ds.datasetChecksum}`
      );
    }
    checksumById.set(ds.datasetId, ds.datasetChecksum);
    datasets.push(ds);
  }

  datasets.sort((a, b) => a.datasetId.localeCompare(b.datasetId));
  return { datasets, unresolved };
}

export function defaultMinEvaluationBarIndex(): number {
  return MIN_WARMUP_BARS;
}
