import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertHistoricalOhlcvDatasetValid } from "./historical-ohlcv-dataset-validation";
import { expectedBarDurationMsForWaveTimeframe } from "./historical-ohlcv-dataset-loader";
import { buildHistoricalFrozenOhlcvDatasetDocument } from "./historical-frozen-ohlcv-dataset";
import type { HistoricalFrozenOhlcvDatasetDocument } from "./historical-frozen-ohlcv-dataset-types";
import type { Candle } from "./types";

/** Thrown when fetched candle count does not meet the research freeze requirement. */
export class InsufficientFrozenDatasetError extends Error {
  readonly code = "INSUFFICIENT_DATASET" as const;

  constructor(
    message: string,
    readonly details?: { symbol: string; timeframe: string; expected: number; actual: number }
  ) {
    super(message);
    this.name = "InsufficientFrozenDatasetError";
  }
}

export function serializeHistoricalFrozenOhlcvDatasetDocument(
  doc: HistoricalFrozenOhlcvDatasetDocument
): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export interface FreezeHistoricalOhlcvDatasetInput {
  candles: readonly Candle[];
  symbol: string;
  timeframe: string;
  relativePath: string;
  cwd?: string;
  expectedCandleCount?: number;
  closedCandleOnly?: boolean;
}

/**
 * Validates candles and writes a B-12q-compatible frozen JSON fixture (no network).
 */
export function freezeHistoricalOhlcvDataset(
  input: FreezeHistoricalOhlcvDatasetInput
): HistoricalFrozenOhlcvDatasetDocument {
  const { candles, symbol, timeframe, relativePath, cwd = process.cwd() } = input;
  const expected = input.expectedCandleCount;
  if (expected !== undefined && candles.length !== expected) {
    throw new InsufficientFrozenDatasetError(
      `INSUFFICIENT_DATASET: ${symbol} ${timeframe} expected ${expected} candles, got ${candles.length}`,
      { symbol, timeframe, expected, actual: candles.length }
    );
  }

  const barMs = expectedBarDurationMsForWaveTimeframe(timeframe) ?? 3_600_000;
  assertHistoricalOhlcvDatasetValid({
    candles,
    expectedBarDurationMs: barMs,
  });

  const doc = buildHistoricalFrozenOhlcvDatasetDocument(candles, {
    symbol,
    timeframe,
    closedCandleOnly: input.closedCandleOnly ?? true,
  });

  const outPath = join(cwd, relativePath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializeHistoricalFrozenOhlcvDatasetDocument(doc), "utf8");
  return doc;
}
